// One-shot schema lookups (element and data type definitions, no content); UmbContentTypeStructureManager throws if closed mid-load.

import { UmbDocumentTypeDetailRepository } from "@umbraco-cms/backoffice/document-type";
import { UmbDataTypeItemRepository } from "@umbraco-cms/backoffice/data-type";

const MAX_TYPES = 50; // guards against composition cycles

/**
 * Properties of an element type, including those from its compositions (owner type's properties win on alias clashes).
 * @param {import("@umbraco-cms/backoffice/controller-api").UmbControllerHost} host
 * @param {string | null | undefined} elementTypeKey
 * @returns {Promise<Map<string, { name: string, dataTypeUnique?: string, editorAlias?: string, editorUiAlias?: string }>>}
 *   Empty map when there's no key or the element type can't be loaded.
 */
export async function resolveElementTypeProperties(host, elementTypeKey) {
  const result = new Map();
  if (!elementTypeKey) return result;

  const typeRepository = new UmbDocumentTypeDetailRepository(host);
  const properties = [];
  const seen = new Set();
  const queue = [elementTypeKey];

  while (queue.length && seen.size < MAX_TYPES) {
    const unique = queue.shift();
    if (seen.has(unique)) continue;
    seen.add(unique);

    const { data, error } = await typeRepository.requestByUnique(unique);
    if (error || !data) {
      if (unique === elementTypeKey) return result;
      continue; // a missing composition only loses its own properties
    }
    properties.push(...(data.properties ?? []));
    for (const composition of data.compositions ?? []) {
      if (composition?.contentType?.unique) queue.push(composition.contentType.unique);
    }
  }

  const uniques = [...new Set(properties.map((p) => p?.dataType?.unique).filter(Boolean))];
  const { data: items } = uniques.length ? await new UmbDataTypeItemRepository(host).requestItems(uniques) : { data: [] };
  const byUnique = new Map((items ?? []).map((item) => [item.unique, item]));

  for (const property of properties) {
    if (!property?.alias || result.has(property.alias)) continue;
    const dataType = byUnique.get(property.dataType?.unique);
    result.set(property.alias, {
      name: property.name,
      dataTypeUnique: property.dataType?.unique,
      editorAlias: dataType?.propertyEditorSchemaAlias,
      editorUiAlias: dataType?.propertyEditorUiAlias,
    });
  }
  return result;
}
