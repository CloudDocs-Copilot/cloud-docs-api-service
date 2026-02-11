import { request, app } from '../setup';
import { registerAndLogin } from '../helpers/auth.helper';
import Membership, { MembershipStatus } from '../../src/models/membership.model';
import Organization from '../../src/models/organization.model';
import Folder from '../../src/models/folder.model';
import DocumentModel from '../../src/models/document.model';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests para validar que la eliminación de membresía limpia correctamente
 * todos los datos del usuario en la organización
 */
describe('Membership Removal - Data Cleanup', () => {
  let ownerCookies: string[];
  let ownerId: string;
  let memberCookies: string[];
  let memberId: string;
  let orgId: string;
  let orgSlug: string;
  let memberRootFolderId: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    
    // Owner crea organización
    const owner = await registerAndLogin({
      name: 'Owner',
      email: `owner-cleanup-${timestamp}@test.com`,
      password: 'Owner@1234',
      createOrganization: true
    });
    ownerCookies = owner.cookies;
    ownerId = owner.userId;

    const org = await Organization.findOne({ owner: ownerId });
    if (!org) throw new Error('Organization not found');
    orgId = org._id.toString();
    orgSlug = org.slug;

    await Organization.findByIdAndUpdate(orgId, {
      plan: 'basic',
      'settings.maxUsers': 10
    });

    // Crear member y añadirlo a la organización
    const member = await registerAndLogin({
      name: 'Member',
      email: `member-cleanup-${timestamp}@test.com`,
      password: 'Member@1234',
      createOrganization: false
    });
    memberCookies = member.cookies;
    memberId = member.userId;

    // Invitar member
    await request(app)
      .post(`/api/memberships/organization/${orgId}/members`)
      .set('Cookie', ownerCookies.join('; '))
      .send({ userId: memberId, role: 'member' })
      .expect(201);

    // Aceptar invitación
    const invitation = await Membership.findOne({
      user: memberId,
      organization: orgId
    });

    await request(app)
      .post(`/api/memberships/invitations/${invitation!._id}/accept`)
      .set('Cookie', memberCookies.join('; '))
      .expect(200);

    // Obtener rootFolder del member
    const memberRootFolder = await Folder.findOne({
      owner: memberId,
      organization: orgId,
      isRoot: true
    });
    
    if (!memberRootFolder) throw new Error('Member root folder not found');
    memberRootFolderId = memberRootFolder._id.toString();
  });

  describe('Should delete all user data when removing membership', () => {
    it('should delete rootFolder from database', async () => {
      // Verificar que existe antes
      const rootFolderBefore = await Folder.findById(memberRootFolderId);
      expect(rootFolderBefore).toBeDefined();

      // Eliminar membresía
      const membership = await Membership.findOne({
        user: memberId,
        organization: orgId
      });

      await request(app)
        .delete(`/api/memberships/organization/${orgId}/members/${membership!._id}`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      // Verificar que se eliminó
      const rootFolderAfter = await Folder.findById(memberRootFolderId);
      expect(rootFolderAfter).toBeNull();
    });

    it('should delete subcarpetas from database', async () => {
      // Crear subcarpeta dentro del rootFolder
      const subfolderResponse = await request(app)
        .post('/api/folders')
        .set('Cookie', memberCookies.join('; '))
        .send({
          name: 'test-subfolder',
          displayName: 'Test Subfolder',
          organizationId: orgId,
          parentId: memberRootFolderId
        })
        .expect(201);

      const subfolderId = subfolderResponse.body.folder.id;

      // Verificar que existe
      const subfolderBefore = await Folder.findById(subfolderId);
      expect(subfolderBefore).toBeDefined();

      // Eliminar membresía
      const membership = await Membership.findOne({
        user: memberId,
        organization: orgId
      });

      await request(app)
        .delete(`/api/memberships/organization/${orgId}/members/${membership!._id}`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      // Verificar que se eliminó la subcarpeta
      const subfolderAfter = await Folder.findById(subfolderId);
      expect(subfolderAfter).toBeNull();
    });

    it('should delete documents from database', async () => {
      // Crear un documento en el rootFolder del member
      // Primero crear el archivo físico de prueba
      const testContent = 'Test document content';
      const storageRoot = path.resolve(process.cwd(), 'storage');
      const userPath = path.resolve(storageRoot, orgSlug, memberId);
      const testFilePath = path.join(userPath, 'test-doc.txt');

      if (!fs.existsSync(userPath)) {
        fs.mkdirSync(userPath, { recursive: true });
      }
      fs.writeFileSync(testFilePath, testContent);

      // Crear registro del documento en la BD
      const doc = await DocumentModel.create({
        filename: 'test-doc.txt',
        originalname: 'test-doc.txt',
        uploadedBy: memberId,
        organization: orgId,
        folder: memberRootFolderId,
        path: testFilePath,
        size: testContent.length,
        mimeType: 'text/plain'
      });

      // Verificar que existe
      const docBefore = await DocumentModel.findById(doc._id);
      expect(docBefore).toBeDefined();

      // Eliminar membresía
      const membership = await Membership.findOne({
        user: memberId,
        organization: orgId
      });

      await request(app)
        .delete(`/api/memberships/organization/${orgId}/members/${membership!._id}`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      // Verificar que se eliminó el documento de la BD
      const docAfter = await DocumentModel.findById(doc._id);
      expect(docAfter).toBeNull();

      // Verificar que se eliminó el archivo físico
      expect(fs.existsSync(testFilePath)).toBe(false);
    });

    it('should delete membership permanently from database', async () => {
      const membership = await Membership.findOne({
        user: memberId,
        organization: orgId
      });

      expect(membership).toBeDefined();
      expect(membership?.status).toBe(MembershipStatus.ACTIVE);

      // Eliminar membresía
      await request(app)
        .delete(`/api/memberships/organization/${orgId}/members/${membership!._id}`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      // Verificar que se eliminó permanentemente (no solo SUSPENDED)
      const membershipAfter = await Membership.findById(membership!._id);
      expect(membershipAfter).toBeNull();
    });

    it('should delete physical storage directory', async () => {
      const storageRoot = path.resolve(process.cwd(), 'storage');
      const userPath = path.resolve(storageRoot, orgSlug, memberId);

      // Verificar que existe
      expect(fs.existsSync(userPath)).toBe(true);

      // Eliminar membresía
      const membership = await Membership.findOne({
        user: memberId,
        organization: orgId
      });

      await request(app)
        .delete(`/api/memberships/organization/${orgId}/members/${membership!._id}`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      // Verificar que se eliminó el directorio físico
      expect(fs.existsSync(userPath)).toBe(false);
    });

    it('should remove user from organization members array', async () => {
      const orgBefore = await Organization.findById(orgId);
      expect(orgBefore?.members.map(m => m.toString())).toContain(memberId);

      // Eliminar membresía
      const membership = await Membership.findOne({
        user: memberId,
        organization: orgId
      });

      await request(app)
        .delete(`/api/memberships/organization/${orgId}/members/${membership!._id}`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      // Verificar que se eliminó del array
      const orgAfter = await Organization.findById(orgId);
      expect(orgAfter?.members.map(m => m.toString())).not.toContain(memberId);
    });

    it('should clean user.organization reference if it was active', async () => {
      // Hacer que esta sea la organización activa del user
      await request(app)
        .post('/api/memberships/set-active')
        .set('Cookie', memberCookies.join('; '))
        .send({ organizationId: orgId })
        .expect(200);

      // Eliminar membresía
      const membership = await Membership.findOne({
        user: memberId,
        organization: orgId
      });

      await request(app)
        .delete(`/api/memberships/organization/${orgId}/members/${membership!._id}`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      // Verificar que se limpió la referencia
      const userAfter = await request(app)
        .get('/api/users/profile')
        .set('Cookie', memberCookies.join('; '))
        .expect(200);

      expect(userAfter.body.organization).toBeUndefined();
      expect(userAfter.body.rootFolder).toBeUndefined();
    });
  });

  describe('Should handle nested folders and documents', () => {
    it('should delete all nested folders and documents', async () => {
      // Crear estructura de carpetas anidadas
      // rootFolder -> subfolder1 -> subfolder2 -> documento
      const subfolder1Res = await request(app)
        .post('/api/folders')
        .set('Cookie', memberCookies.join('; '))
        .send({
          name: 'subfolder1',
          organizationId: orgId,
          parentId: memberRootFolderId
        })
        .expect(201);
      const subfolder1Id = subfolder1Res.body.folder.id;

      const subfolder2Res = await request(app)
        .post('/api/folders')
        .set('Cookie', memberCookies.join('; '))
        .send({
          name: 'subfolder2',
          organizationId: orgId,
          parentId: subfolder1Id
        })
        .expect(201);
      const subfolder2Id = subfolder2Res.body.folder.id;

      // Crear documento en subfolder2
      const storageRoot = path.resolve(process.cwd(), 'storage');
      const userPath = path.resolve(storageRoot, orgSlug, memberId);
      
      // Asegurar que el directorio existe antes de escribir
      if (!fs.existsSync(userPath)) {
        fs.mkdirSync(userPath, { recursive: true });
      }
      
      const testFilePath = path.join(userPath, 'nested-doc.txt');
      fs.writeFileSync(testFilePath, 'Nested content');

      const doc = await DocumentModel.create({
        filename: 'nested-doc.txt',
        originalname: 'nested-doc.txt',
        uploadedBy: memberId,
        organization: orgId,
        folder: subfolder2Id,
        path: testFilePath,
        size: 14,
        mimeType: 'text/plain'
      });

      // Eliminar membresía
      const membership = await Membership.findOne({
        user: memberId,
        organization: orgId
      });

      await request(app)
        .delete(`/api/memberships/organization/${orgId}/members/${membership!._id}`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      // Verificar que TODO se eliminó
      expect(await Folder.findById(subfolder1Id)).toBeNull();
      expect(await Folder.findById(subfolder2Id)).toBeNull();
      expect(await DocumentModel.findById(doc._id)).toBeNull();
      expect(fs.existsSync(testFilePath)).toBe(false);
    });
  });

  describe('When user leaves organization voluntarily', () => {
    it('should clean all data when user leaves', async () => {
      // Crear algunas carpetas y docs
      const subfolderRes = await request(app)
        .post('/api/folders')
        .set('Cookie', memberCookies.join('; '))
        .send({
          name: 'my-folder',
          organizationId: orgId,
          parentId: memberRootFolderId
        })
        .expect(201);

      // Member abandona la organización
      await request(app)
        .delete(`/api/memberships/${orgId}/leave`)
        .set('Cookie', memberCookies.join('; '))
        .expect(200);

      // Verificar limpieza completa
      expect(await Folder.findById(memberRootFolderId)).toBeNull();
      expect(await Folder.findById(subfolderRes.body.folder.id)).toBeNull();
      expect(await Membership.findOne({ user: memberId, organization: orgId })).toBeNull();
    });
  });
});
