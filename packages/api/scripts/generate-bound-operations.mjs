import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const directory = process.argv[2] ?? 'src/generated';
const source = readFileSync(join(directory, 'sdk.gen.ts'), 'utf8');
const definitions = readFileSync(join(directory, 'types.gen.ts'), 'utf8');
const sdk = ts.createSourceFile('sdk.gen.ts', source, ts.ScriptTarget.Latest, true);
const types = ts.createSourceFile('types.gen.ts', definitions, ts.ScriptTarget.Latest, true);
const data = new Map();
for (const statement of types.statements) {
  if (!ts.isTypeAliasDeclaration(statement) || !statement.name.text.endsWith('Data') || !ts.isTypeLiteralNode(statement.type)) continue;
  const properties = statement.type.members.filter(ts.isPropertySignature).map((member) => ({
    name: member.name.getText(types).replaceAll(/["']/g, ''),
    required: !member.questionToken,
    never: member.type?.kind === ts.SyntaxKind.NeverKeyword,
  }));
  data.set(statement.name.text, properties);
}
const operations = [];
for (const statement of sdk.statements) {
  if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
  for (const declaration of statement.declarationList.declarations) {
    const name = declaration.name.getText(sdk);
    const operationData = source.slice(declaration.pos, declaration.end).match(/Options<([A-Za-z0-9]+Data),\s*ThrowOnError>/)?.[1];
    if (!operationData || !data.has(operationData)) continue;
    operations.push({ name, operationData, properties: data.get(operationData) });
  }
}
if (!operations.length) throw new Error('No OpenAPI operations found');
const lines = [
  '// Generated from the OpenAPI operation declarations. Run npm run codegen.',
  'import * as sdk from "./sdk.gen.js";',
  'import type * as types from "./types.gen.js";',
  'import type { Client } from "./client/index.js";',
  'import type { Options } from "./sdk.gen.js";',
  '',
  'export function bindOperations(client: Client) {',
  '  return {',
];
for (const { name, operationData, properties } of operations) {
  const body = properties.find((property) => property.name === 'body' && !property.never);
  const requiredOther = properties.some((property) => property.required && !property.never && property.name !== 'url' && property.name !== 'body');
  if (body?.required && !requiredOther) {
    lines.push(`    ${name}: <ThrowOnError extends boolean = false>(body: types.${operationData}["body"], options?: Omit<Options<types.${operationData}, ThrowOnError>, "client" | "body">) => sdk.${name}<ThrowOnError>({ ...options, client, body }),`);
  } else if (requiredOther) {
    lines.push(`    ${name}: <ThrowOnError extends boolean = false>(options: Omit<Options<types.${operationData}, ThrowOnError>, "client">) => sdk.${name}<ThrowOnError>({ ...options, client }),`);
  } else {
    lines.push(`    ${name}: <ThrowOnError extends boolean = false>(options?: Omit<Options<types.${operationData}, ThrowOnError>, "client">) => sdk.${name}<ThrowOnError>({ ...options, client }),`);
  }
}
lines.push('  };', '}', '', 'export type BoundOperations = ReturnType<typeof bindOperations>;', '');
writeFileSync(join(directory, 'bound.gen.ts'), lines.join('\n'));

const contract = readFileSync(new URL('../../../openapi/shirabe.yaml', import.meta.url), 'utf8');
const oauthScheme = contract.split(/^    McpOAuth:\s*$/m)[1]?.split(/^    BearerAuth:\s*$/m)[0];
const scopes = [...(oauthScheme ?? '').matchAll(/^ {12}([a-z]+(?::[a-z]+)+): /gm)].map((match) => match[1]);
if (scopes.length < 2 || new Set(scopes).size !== scopes.length) throw new Error('OpenAPI OAuth scopes are missing or duplicated');
writeFileSync(join(directory, 'scopes.gen.ts'), [
  '// Generated from the OAuth security scheme in openapi/shirabe.yaml.',
  'export const SHIRABE_SCOPES = [',
  ...scopes.map((scope) => `  ${JSON.stringify(scope)},`),
  '] as const;',
  'export type ShirabeScope = (typeof SHIRABE_SCOPES)[number];',
  '',
].join('\n'));
