#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(
  process.env.MIMIMIA_REPOSITORY_ROOT ?? fileURLToPath(new URL('../../', import.meta.url)),
);
const LEDGER_RELATIVE_PATH = 'docs/assets/asset-ledger.csv';
const ASSET_ROOTS = ['public/assets', 'art/source'];
const REQUIRED_COLUMNS = [
  'asset_id',
  'path',
  'category',
  'creator_or_source',
  'creation_method',
  'modifications',
  'license_basis',
  'public_use_status',
  'sha256',
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(rootPath) {
  if (!(await exists(rootPath))) return [];
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath));
    if (entry.isFile() && entry.name !== '.gitkeep') files.push(absolutePath);
  }
  return files;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('素材台账包含未闭合的引号');
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function verifyAssetLedger(repositoryRoot = REPOSITORY_ROOT) {
  const failures = [];
  const ledgerPath = path.join(repositoryRoot, LEDGER_RELATIVE_PATH);
  if (!(await exists(ledgerPath))) throw new Error(`素材台账不存在：${LEDGER_RELATIVE_PATH}`);

  const rows = parseCsv(await readFile(ledgerPath, 'utf8'));
  const header = rows.shift() ?? [];
  if (header.join(',') !== REQUIRED_COLUMNS.join(',')) {
    failures.push(`素材台账列必须严格为：${REQUIRED_COLUMNS.join(',')}`);
  }

  const records = rows.map((values, index) => {
    if (values.length !== REQUIRED_COLUMNS.length) {
      failures.push(`素材台账第 ${index + 2} 行列数错误`);
    }
    return Object.fromEntries(REQUIRED_COLUMNS.map((column, columnIndex) => [column, (values[columnIndex] ?? '').trim()]));
  });

  const recordsByPath = new Map();
  const assetIds = new Set();
  for (const record of records) {
    const missing = REQUIRED_COLUMNS.filter((column) => !record[column]);
    if (missing.length > 0) failures.push(`素材记录 ${record.path || '(无路径)'} 缺少：${missing.join(', ')}`);
    if (assetIds.has(record.asset_id)) failures.push(`素材编号重复：${record.asset_id}`);
    assetIds.add(record.asset_id);
    const normalizedPath = record.path.replaceAll('\\', '/').replace(/^\.\//, '');
    const existing = recordsByPath.get(normalizedPath) ?? [];
    existing.push(record);
    recordsByPath.set(normalizedPath, existing);
  }

  const assetFiles = [];
  for (const rootName of ASSET_ROOTS) assetFiles.push(...await listFiles(path.join(repositoryRoot, rootName)));

  for (const filePath of assetFiles) {
    const relativePath = path.relative(repositoryRoot, filePath).split(path.sep).join('/');
    const matchingRecords = recordsByPath.get(relativePath) ?? [];
    if (matchingRecords.length !== 1) {
      failures.push(`${relativePath} 必须恰有一条素材记录，当前为 ${matchingRecords.length} 条`);
      continue;
    }
    const [record] = matchingRecords;
    if (relativePath.startsWith('public/assets/') && record.public_use_status !== 'approved') {
      failures.push(`运行时素材未批准公开：${relativePath}`);
    }
    const actualHash = await sha256(filePath);
    if (record.sha256 !== actualHash) failures.push(`素材校验值不匹配：${relativePath}`);
  }

  if (failures.length > 0) {
    throw new Error(`素材台账检查失败：\n- ${failures.join('\n- ')}`);
  }

  return { files: assetFiles.length, records: records.length };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  verifyAssetLedger()
    .then(({ files, records }) => console.log(`素材台账通过：已检查 ${files} 个素材文件和 ${records} 条记录。`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
