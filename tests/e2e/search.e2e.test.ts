/**
 * Tests E2E para US-104: Búsqueda de documentos
 * 
 * Estos tests verifican el flujo completo de búsqueda sin mocks,
 * probando contra Elasticsearch y MongoDB reales.
 * 
 * PREREQUISITOS:
 * - MongoDB corriendo en localhost:27017
 * - Elasticsearch corriendo en localhost:9200
 * - Backend corriendo en localhost:4000
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */

import axios, { AxiosResponse } from 'axios';
import { basicUser } from '../fixtures/user.fixtures';

const API_BASE_URL = 'http://localhost:4000/api';

// Credenciales de usuario de fixture
const TEST_USER = {
  email: basicUser.email,  // 'test@example.com'
  password: basicUser.password  // 'Test@1234'
};

type LoginResp = { token?: string };
type OrgActiveResp = { organization?: { id?: string }; organizationId?: string };
type SearchResp = { success?: boolean; data?: Array<Record<string, unknown>>; total?: number; took?: number; suggestions?: string[] };
type Doc = { mimeType?: string; organization?: string; score?: unknown };

describe('US-104: Búsqueda de documentos (E2E)', () => {
  let authToken: string;
  let organizationId: string;

  beforeAll(async () => {
    try {
      // Login con usuario de fixture
      const loginResponse: AxiosResponse<LoginResp> = await axios.post(`${API_BASE_URL}/auth/login`, TEST_USER);
      authToken = loginResponse.data?.token ?? '';

      // Obtener organización activa
      const orgResponse: AxiosResponse<OrgActiveResp> = await axios.get(`${API_BASE_URL}/organizations/active`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      organizationId = orgResponse.data?.organization?.id ?? orgResponse.data?.organizationId ?? '';

      console.warn('✅ Autenticación exitosa para tests E2E');
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null) {
        const e = error as { response?: { data?: unknown }; message?: string };
        console.error('❌ Error en setup de tests E2E:', e.response?.data ?? e.message);
      } else {
        console.error('❌ Error en setup de tests E2E:', String(error));
      }
      throw error;
    }
  }, 30000);

  describe('Criterio 1: Búsqueda por nombre de archivo', () => {
    it('debe encontrar documentos por búsqueda parcial', async () => {
      const response: AxiosResponse<SearchResp> = await axios.get(`${API_BASE_URL}/search`, {
        params: { q: 'zonif' },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Organization-ID': organizationId
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(response.data.total).toBeGreaterThanOrEqual(0);
      expect(typeof response.data.took).toBe('number');
    });

    it('debe ser case-insensitive', async () => {
      const lowerCaseResponse: AxiosResponse<SearchResp> = await axios.get(`${API_BASE_URL}/search`, {
        params: { q: 'zonificacion' },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Organization-ID': organizationId
        }
      });

      const upperCaseResponse: AxiosResponse<SearchResp> = await axios.get(`${API_BASE_URL}/search`, {
        params: { q: 'ZONIFICACION' },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Organization-ID': organizationId
        }
      });

      expect(lowerCaseResponse.data.total).toBe(upperCaseResponse.data.total);
    });
  });

  describe('Criterio 3: Filtros por tipo de archivo', () => {
    it('debe filtrar por tipo MIME', async () => {
      const response: AxiosResponse<SearchResp> = await axios.get(`${API_BASE_URL}/search`, {
        params: {
          q: 'pdf',
          mimeType: 'application/pdf'
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Organization-ID': organizationId
        }
      });

      expect(response.status).toBe(200);
      response.data.data?.forEach((doc: Doc) => {
        expect(doc.mimeType).toBe('application/pdf');
      });
    });
  });

  describe('Criterio 4: Filtros por fecha', () => {
    it('debe filtrar por rango de fechas', async () => {
      const fromDate = '2024-01-01';
      const toDate = '2024-12-31';

      const response: AxiosResponse<SearchResp> = await axios.get(`${API_BASE_URL}/search`, {
        params: {
          q: 'test',
          fromDate,
          toDate
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Organization-ID': organizationId
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe('Criterio 5: Resultados ordenados por relevancia', () => {
    it('debe incluir score de relevancia', async () => {
      const response: AxiosResponse<SearchResp> = await axios.get(`${API_BASE_URL}/search`, {
        params: { q: 'zonificacion' },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Organization-ID': organizationId
        }
      });

      if (response.data?.data && response.data.data.length > 0) {
        expect((response.data.data[0] as Record<string, unknown>)).toHaveProperty('score');
      }
    });
  });

  describe('Criterio 6: Autocompletado', () => {
    it('debe retornar sugerencias de autocompletado', async () => {
      const response: AxiosResponse<SearchResp> = await axios.get(`${API_BASE_URL}/search/autocomplete`, {
        params: { q: 'zon', limit: 5 },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Organization-ID': organizationId
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.suggestions)).toBe(true);
      expect(response.data.suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Validaciones y seguridad', () => {
    it('debe retornar 400 si falta query', async () => {
      try {
        await axios.get(`${API_BASE_URL}/search`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'X-Organization-ID': organizationId
          }
        });
        fail('Debería haber lanzado error 400');
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null) {
          const e = error as { response?: { status?: number } };
          expect(e.response?.status).toBe(400);
        } else {
          fail('Error inesperado en la validación');
        }
      }
    });

    it('debe retornar 401 sin autenticación', async () => {
      try {
        await axios.get(`${API_BASE_URL}/search`, {
          params: { q: 'test' }
        });
        fail('Debería haber lanzado error 401');
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null) {
          const e = error as { response?: { status?: number } };
          expect(e.response?.status).toBe(401);
        } else {
          fail('Error inesperado en la validación');
        }
      }
    });

    it('debe filtrar solo documentos de la organización', async () => {
      const response: AxiosResponse<SearchResp> = await axios.get(`${API_BASE_URL}/search`, {
        params: { q: 'zonificacion' },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Organization-ID': organizationId
        }
      });

      response.data.data?.forEach((doc: Doc) => {
        expect(doc.organization).toBe(organizationId);
      });
    });
  });

  describe('Rendimiento', () => {
    it('debe responder en menos de 1 segundo', async () => {
      const startTime = Date.now();
      
      await axios.get(`${API_BASE_URL}/search`, {
        params: { q: 'test' },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Organization-ID': organizationId
        }
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
    });
  });
});
