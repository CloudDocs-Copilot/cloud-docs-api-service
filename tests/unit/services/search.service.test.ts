﻿jest.disableAutomock();

import mongoose from "mongoose";
import { IDocument } from "../../../src/models/document.model";

jest.mock("../../../src/configurations/elasticsearch-config", () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(),
  },
}));

import ElasticsearchClient from "../../../src/configurations/elasticsearch-config";

const searchService = jest.requireActual("../../../src/services/search.service") as typeof import("../../../src/services/search.service");

describe("Search Service", () => {
  const mockClient = {
    index: jest.fn(),
    delete: jest.fn(),
    search: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (ElasticsearchClient as any).getInstance.mockReturnValue(mockClient);

    mockClient.index.mockResolvedValue({ result: "created" });
    mockClient.delete.mockResolvedValue({ result: "deleted" });
    mockClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } }, took: 1 });
  });

  it("indexDocument debe indexar un documento correctamente", async () => {
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      filename: "test.pdf",
      originalname: "Test Document.pdf",
      extractedContent: "contenido",
      mimeType: "application/pdf",
      size: 1024,
      uploadedBy: new mongoose.Types.ObjectId(),
      organization: new mongoose.Types.ObjectId(),
      folder: new mongoose.Types.ObjectId(),
      uploadedAt: new Date(),
    } as IDocument;

    await searchService.indexDocument(doc);

    expect(mockClient.index).toHaveBeenCalledTimes(1);
    expect(mockClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "documents",
        id: doc._id.toString(),
        document: expect.objectContaining({
          filename: "test.pdf",
          originalname: "Test Document.pdf",
          extractedContent: "contenido",
          mimeType: "application/pdf",
        }),
      })
    );
  });

  it("removeDocumentFromIndex debe eliminar un documento del índice", async () => {
    const id = new mongoose.Types.ObjectId().toString();

    await searchService.removeDocumentFromIndex(id);

    expect(mockClient.delete).toHaveBeenCalledTimes(1);
    expect(mockClient.delete).toHaveBeenCalledWith({ index: "documents", id });
  });

  it("removeDocumentFromIndex debe manejar 404 sin lanzar error", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    mockClient.delete.mockRejectedValueOnce({ meta: { statusCode: 404 } });

    await expect(searchService.removeDocumentFromIndex(id)).resolves.toBeUndefined();
  });

  it("searchDocuments debe buscar en 4 fields y filtrar por mimeType", async () => {
    mockClient.search.mockResolvedValueOnce({
      hits: {
        hits: [
          {
            _id: "1",
            _score: 1.5,
            _source: { filename: "test.pdf", originalname: "Test.pdf", extractedContent: "algo" },
          },
        ],
        total: { value: 1 },
      },
      took: 10,
    });

    const res = await searchService.searchDocuments({
      query: "test",
      userId: new mongoose.Types.ObjectId().toString(),
      mimeType: "application/pdf",
    });

    expect(mockClient.search).toHaveBeenCalledTimes(1);

    expect(mockClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "documents",
        query: expect.objectContaining({
          bool: expect.objectContaining({
            must: expect.arrayContaining([
              expect.objectContaining({
                query_string: expect.objectContaining({
                  query: "*test*",
                  fields: ["filename", "originalname", "content", "extractedContent"],
                }),
              }),
            ]),
            filter: expect.arrayContaining([
              expect.objectContaining({ term: expect.objectContaining({ uploadedBy: expect.any(String) }) }),
              { term: { mimeType: "application/pdf" } },
            ]),
          }),
        }),
      })
    );

    expect(res.total).toBe(1);
    expect(res.took).toBe(10);
    expect(res.documents).toHaveLength(1);
  });

  it("getAutocompleteSuggestions debe devolver sugerencias únicas y respetar limit", async () => {
    mockClient.search.mockResolvedValueOnce({
      hits: {
        hits: [
          { _source: { originalname: "Test.pdf" } },
          { _source: { originalname: "Test.pdf" } },
          { _source: { originalname: "Testing.pdf" } },
        ],
        total: { value: 3 },
      },
      took: 1,
    });

    const suggestions = await searchService.getAutocompleteSuggestions(
      "test",
      new mongoose.Types.ObjectId().toString(),
      undefined,
      2
    );

    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions).toContain("Test.pdf");
    expect(suggestions.length).toBeLessThanOrEqual(2);
  });
});
