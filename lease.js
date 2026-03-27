// Google Apps Script - Code.gs

// 1. Serve HTML
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Land Management System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 2. Login
function verifyLogin(credentials) {
  const validUsers = [{ username: 'mehedi4894', password: 'Mehedi@01747527352', name: 'Mehedi' }];
  const user = validUsers.find(u => u.username === credentials.username && u.password === credentials.password);
  return user ? { success: true, user: { username: user.username, name: user.name } } : { success: false, message: 'Invalid Credentials!' };
}

// 3. Save Entry Data
function saveFormData(formData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('LandData');
    if (!sheet) {
      sheet = ss.insertSheet('LandData');
      sheet.appendRow(['Date', 'Name', 'Land', 'Rate', 'Total Tk', 'Tk Given', 'Hari Year', 'Entry By']);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
    }
    
    const totalTk = (parseFloat(formData.rate) / 33) * parseFloat(formData.land);
    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' });
    
    sheet.appendRow([timestamp, formData.name, formData.land, formData.rate, totalTk.toFixed(2), formData.tkGiven || 0, formData.hariYear || "", formData.loggedInUser]);
    return { success: true };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// Helper: Year Extraction
function getYearSafe(dateVal) {
  if (!dateVal) return "";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    return Utilities.formatDate(d, "Asia/Dhaka", "yyyy");
  } catch (e) { return ""; }
}

// 4. Get Initial Data
function getInitData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName('LandData');
  const profilesSheet = ss.getSheetByName('Profiles');

  let profiles = [];
  if (profilesSheet && profilesSheet.getLastRow() > 1) {
     const lastCol = Math.max(profilesSheet.getLastColumn(), 4);
     const dataRows = profilesSheet.getRange(2, 1, profilesSheet.getLastRow() - 1, lastCol).getValues();
     profiles = dataRows.map(row => ({ 
         name: row[0], 
         land: row[1], 
         rate: row[2], 
         hariBorsho: row[3] || "" 
     }));
  }

  const allYears = new Set();
  const namesFromData = new Set(); 
  const landMap = {}; 
  const yearMap = {}; 

  if (dataSheet && dataSheet.getLastRow() > 1) {
    const data = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, 3).getValues();
    
    data.forEach(row => {
      const dateVal = row[0];
      const nameVal = row[1] ? String(row[1]).trim() : "";
      const landVal = row[2];
      const year = getYearSafe(dateVal);

      if (nameVal !== "") {
        namesFromData.add(nameVal);
        
        if (!landMap[nameVal]) landMap[nameVal] = new Set();
        if (landVal !== "" && landVal != null) landMap[nameVal].add(landVal);

        if (year) {
          allYears.add(year);
          if (!yearMap[nameVal]) yearMap[nameVal] = new Set();
          yearMap[nameVal].add(year);
        }
      }
    });
  }
  
  const finalLandMap = {};
  for (let key in landMap) finalLandMap[key] = Array.from(landMap[key]).sort((a, b) => a - b);

  const finalYearMap = {}; 
  for (let key in yearMap) finalYearMap[key] = Array.from(yearMap[key]).sort((a,b) => b-a);

  return { 
    profiles: profiles,
    searchOptions: {
        names: Array.from(namesFromData).sort(), 
        years: Array.from(allYears).sort((a,b) => b-a),
        yearMap: finalYearMap, 
        landMap: finalLandMap 
    }
  };
}

// 5. Get Report Data
function getReportData(searchData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('LandData');
  if (!sheet || sheet.getLastRow() < 2) return { success: false, records: [] };
  
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  let records = [];
  
  rows.forEach(row => {
    const rowYear = getYearSafe(row[0]);
    const rowName = row[1] ? String(row[1]).trim() : "";
    const rowLand = parseFloat(row[2]);
    const searchLand = parseFloat(searchData.land);
    
    const matchName = (searchData.name === "ALL" || rowName === searchData.name);
    const matchLand = (searchData.land === "ALL" || isNaN(searchLand) || rowLand === searchLand);
    const matchYear = (searchData.year === "ALL" || rowYear === searchData.year);
    
    if (matchName && matchLand && matchYear) {
      records.push({
        date: new Date(row[0]).toLocaleDateString('en-GB'),
        year: rowYear, 
        name: rowName, land: row[2], rate: row[3],
        total: parseFloat(row[4]).toFixed(2), given: parseFloat(row[5]).toFixed(2),
        hariYear: row[6] || "",
        entryBy: row[7]
      });
    }
  });
  return { success: true, records: records };
}

// 6. Delete Records
function deleteRecords(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('LandData');
    if (!sheet || sheet.getLastRow() < 2) return { success: false, message: "No data found" };
    
    const lastRow = sheet.getLastRow();
    const dataRows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    let rowsDeleted = 0;
    
    for (let i = dataRows.length - 1; i >= 0; i--) {
      const row = dataRows[i];
      const rowName = row[1] ? String(row[1]).trim() : "";
      const rowYear = getYearSafe(row[0]);
      
      if (rowName === data.name && rowYear === data.year) {
        sheet.deleteRow(i + 2);
        rowsDeleted++;
      }
    }
    return { success: true, message: rowsDeleted + " records deleted." };
  } catch (e) { return { success: false, message: e.toString() }; }
}

// --- PROFILE MANAGEMENT ---

function saveProfile(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Profiles');
  if (!sheet) {
    sheet = ss.insertSheet('Profiles');
    sheet.appendRow(['Name', 'Land', 'Rate', 'HariBorsho']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  
  let found = false;
  const lastRow = sheet.getLastRow();
  
  if (lastRow > 1) {
    const dataRows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (let i = 0; i < dataRows.length; i++) {
      if (dataRows[i][0] == data.oldName && dataRows[i][1] == data.oldLand && dataRows[i][2] == data.oldRate) {
        sheet.getRange(i + 2, 1, 1, 4).setValues([[data.name, data.land, data.rate, data.hariBorsho]]);
        found = true;
        break;
      }
    }
  }
  if (!found) sheet.appendRow([data.name, data.land, data.rate, data.hariBorsho]);
  return { success: true };
}

function deleteProfile(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Profiles');
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const dataRows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  for (let i = 0; i < dataRows.length; i++) {
     if (dataRows[i][0] == data.name && dataRows[i][1] == data.land && dataRows[i][2] == data.rate) {
       sheet.deleteRow(i + 2);
       break;
     }
  }
  return { success: true };
}