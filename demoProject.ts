import { UploadedFile } from './types';

export const demoLibraryFiles: UploadedFile[] = [
  {
    name: 'Code.gs',
    content: `/**
 * Greets a person by name.
 * @param {string} name The name to greet.
 * @returns {string} The greeting.
 */
function greet(name) {
  if (!name) {
    name = 'World';
  }
  return 'Hello, ' + name + '!';
}

/**
 * A function with a potential performance issue.
 * It uses a loop inside another loop to find data.
 */
function findMatchingData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Data');
  const data = sheet.getDataRange().getValues(); // Gets all data
  const lookupValues = ['A', 'C', 'E'];
  let results = [];

  // Inefficient loop within a loop
  for (var i = 0; i < lookupValues.length; i++) {
    for (var j = 0; j < data.length; j++) {
      if (data[j][0] == lookupValues[i]) {
        results.push(data[j]);
      }
    }
  }
  return results;
}`,
  },
  {
    name: 'Config.gs',
    content: `// A hardcoded configuration value.
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";

/**
 * Gets the configured spreadsheet by its hardcoded ID.
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} The spreadsheet object.
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}`
  },
  {
    name: 'CHANGELOG.md',
    content: `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-05-27
### Added
- Initial project setup.`
  },
  {
    name: 'appsscript.json',
    content: `{
  "timeZone": "America/New_York",
  "dependencies": {
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}`,
  }
];

export const demoFrontendFiles: UploadedFile[] = [
  {
    name: 'Code.gs',
    content: `function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('Demo')
      .addItem('Show Greeting', 'showGreetingDialog')
      .addToUi();
}

function showGreetingDialog() {
  // Using a library function
  const message = MyGreeterLibrary.greet('Apps Script User');
  
  const html = HtmlService.createHtmlOutput(\`<p>\${message}</p>\`)
      .setWidth(250)
      .setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(html, 'Greeting');
}

// This function calls the library's inefficient function
function processData() {
  var matches = MyGreeterLibrary.findMatchingData();
  Logger.log(matches.length + ' matches found.');
}`,
  },
    {
    name: 'CHANGELOG.md',
    content: `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-05-27
### Added
- Initial frontend setup.`
  },
  {
    name: 'appsscript.json',
    content: `{
  "timeZone": "America/New_York",
  "dependencies": {
    "libraries": [{
      "userSymbol": "MyGreeterLibrary",
      "libraryId": "SOME_ID_PROVIDED_BY_USER",
      "version": "1"
    }]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}`,
  },
  {
    name: 'index.html',
    content: `<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <h1>Welcome!</h1>
    <p>This is a sample HTML file for the frontend project.</p>
    
    <!-- Missing alt attribute -->
    <img src="https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png">
    
    <script>
      function onInit() {
        // Client-side script logic can go here.
        console.log("Frontend initialized.");
      }
    </script>
  </body>
</html>
`,
  }
];