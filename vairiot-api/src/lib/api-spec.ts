import { openApiSpec } from './openapi';
import { accountingPaths } from './openapi-accounting';
import { conditionPaths } from './openapi-condition';
import { gisPaths } from './openapi-gis';
import { importPaths } from './openapi-import';
import { scanPhotoPaths } from './openapi-photos';

/** The served OpenAPI document: the core spec plus each module's paths. */
export const apiSpec = {
  ...openApiSpec,
  paths: { ...openApiSpec.paths, ...gisPaths, ...scanPhotoPaths, ...conditionPaths, ...accountingPaths, ...importPaths },
};
