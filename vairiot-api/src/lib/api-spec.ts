import { openApiSpec } from './openapi';
import { gisPaths } from './openapi-gis';

/** The served OpenAPI document: the core spec plus each module's paths. */
export const apiSpec = {
  ...openApiSpec,
  paths: { ...openApiSpec.paths, ...gisPaths },
};
