const DEFAULT_TEMPLATE_SPREADSHEET_ID = '19sQKTDoEi9I4ZEjvYrR6m0DfwAdiEsQLC5MY9yuCbwE';
const DEFAULT_COPY_PREFIX = 'SmallTalK 생활기록부';
const DEFAULT_START_ROW = 2;

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const props = PropertiesService.getScriptProperties();
    const expectedSecret = props.getProperty('WEBHOOK_SECRET') || '';

    if (expectedSecret && body.secret !== expectedSecret) {
      return jsonOutput_({ ok: false, error: '인증 코드가 올바르지 않습니다.' });
    }

    const className = String(body.className || '').trim();
    if (!/^\d{1,2}반$/.test(className)) {
      return jsonOutput_({ ok: false, error: '반 정보가 올바르지 않습니다.' });
    }

    const rows = normalizeRows_(body.rows || []);
    const fileResult = getOrCreateClassSpreadsheet_(className);
    const sheet = getTargetSheet_(fileResult.spreadsheet);
    overwriteRows_(sheet, rows);
    shareFileIfConfigured_(fileResult.file);

    return jsonOutput_({
      ok: true,
      spreadsheetId: fileResult.spreadsheet.getId(),
      url: fileResult.spreadsheet.getUrl(),
      className,
      rows: rows.length,
      created: fileResult.created,
    });
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: error && error.message ? error.message : '구글시트 처리 중 오류가 발생했습니다.',
    });
  }
}

function getOrCreateClassSpreadsheet_(className) {
  const props = PropertiesService.getScriptProperties();
  const templateId = props.getProperty('TEMPLATE_SPREADSHEET_ID') || DEFAULT_TEMPLATE_SPREADSHEET_ID;
  const copyPrefix = props.getProperty('COPY_PREFIX') || DEFAULT_COPY_PREFIX;
  const folderId = props.getProperty('FOLDER_ID') || '';
  const fileName = `${copyPrefix} - ${className}`;
  const existing = findExistingSpreadsheet_(fileName, folderId);

  if (existing) {
    return {
      file: existing,
      spreadsheet: SpreadsheetApp.openById(existing.getId()),
      created: false,
    };
  }

  const templateFile = DriveApp.getFileById(templateId);
  const copiedFile = folderId
    ? templateFile.makeCopy(fileName, DriveApp.getFolderById(folderId))
    : templateFile.makeCopy(fileName);

  return {
    file: copiedFile,
    spreadsheet: SpreadsheetApp.openById(copiedFile.getId()),
    created: true,
  };
}

function findExistingSpreadsheet_(fileName, folderId) {
  const files = folderId
    ? DriveApp.getFolderById(folderId).getFilesByName(fileName)
    : DriveApp.getFilesByName(fileName);

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS && !file.isTrashed()) {
      return file;
    }
  }

  return null;
}

function getTargetSheet_(spreadsheet) {
  const props = PropertiesService.getScriptProperties();
  const sheetName = props.getProperty('SHEET_NAME') || '';
  const sheet = sheetName ? spreadsheet.getSheetByName(sheetName) : spreadsheet.getSheets()[0];

  if (!sheet) {
    throw new Error(sheetName ? `시트 탭을 찾을 수 없습니다: ${sheetName}` : '첫 번째 시트 탭을 찾을 수 없습니다.');
  }

  return sheet;
}

function overwriteRows_(sheet, rows) {
  const props = PropertiesService.getScriptProperties();
  const startRow = Math.max(Number(props.getProperty('START_ROW') || DEFAULT_START_ROW), 1);
  const clearHeight = Math.max(sheet.getMaxRows() - startRow + 1, 1);

  sheet.getRange(startRow, 1, clearHeight, 5).clearContent();

  if (rows.length === 0) return;

  const requiredRows = startRow + rows.length - 1;
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }

  sheet.getRange(startRow, 1, rows.length, 5).setValues(rows);
}

function normalizeRows_(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const safeRow = Array.isArray(row) ? row : [];
    return [0, 1, 2, 3, 4].map((index) => {
      const value = safeRow[index];
      return value === null || typeof value === 'undefined' ? '' : value;
    });
  });
}

function shareFileIfConfigured_(file) {
  const props = PropertiesService.getScriptProperties();
  const emails = String(props.getProperty('SHARE_EMAILS') || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  emails.forEach((email) => file.addEditor(email));
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
