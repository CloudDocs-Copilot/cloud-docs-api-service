/**
 * Script to merge coverage reports from multiple Jest configurations
 *
 * This script combines coverage from:
 * - Main test suite (integration + most unit tests)
 * - Unit test suite (embedding and other isolated unit tests)
 *
 * Output: Combined coverage report in coverage/ directory
 */

const fs = require('fs');
const path = require('path');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const coverageMainPath = path.join(__dirname, '../coverage/main/coverage-final.json');
const coverageUnitPath = path.join(__dirname, '../coverage/unit/coverage-final.json');
const outputDir = path.join(__dirname, '../coverage');
const outputFile = path.join(outputDir, 'coverage-final.json');

console.log('🔄 Merging coverage reports...\n');

// Check if coverage files exist
const mainExists = fs.existsSync(coverageMainPath);
const unitExists = fs.existsSync(coverageUnitPath);

if (!mainExists && !unitExists) {
  console.error('❌ No coverage files found!');
  console.error('   Expected:', coverageMainPath);
  console.error('   Expected:', coverageUnitPath);
  process.exit(1);
}

// Create coverage map
const coverageMap = createCoverageMap({});

// Merge main coverage if exists
if (mainExists) {
  console.log('✅ Loading main coverage from:', coverageMainPath);
  const mainCoverage = JSON.parse(fs.readFileSync(coverageMainPath, 'utf8'));
  coverageMap.merge(mainCoverage);
  console.log(`   → ${Object.keys(mainCoverage).length} files`);
} else {
  console.log('⚠️  Main coverage not found, skipping');
}

// Merge unit coverage if exists
if (unitExists) {
  console.log('✅ Loading unit coverage from:', coverageUnitPath);
  const unitCoverage = JSON.parse(fs.readFileSync(coverageUnitPath, 'utf8'));
  coverageMap.merge(unitCoverage);
  console.log(`   → ${Object.keys(unitCoverage).length} files`);
} else {
  console.log('⚠️  Unit coverage not found, skipping');
}

// Get merged data
const mergedCoverage = coverageMap.toJSON();
const fileCount = Object.keys(mergedCoverage).length;

console.log(`\n📊 Merged coverage: ${fileCount} total files\n`);

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write merged coverage JSON
fs.writeFileSync(outputFile, JSON.stringify(mergedCoverage, null, 2));
console.log('✅ Merged JSON written to:', outputFile);

// Create context for report generation
const context = createContext({
  dir: outputDir,
  coverageMap,
  sourceFinder: filePath => {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return '';
    }
  }
});

// Generate reports
console.log('\n📄 Generating reports...\n');

// HTML report
const htmlReport = reports.create('html', {});
htmlReport.execute(context);
console.log('✅ HTML report generated in: coverage/lcov-report/index.html');

// LCOV report (for CI tools like Codecov, Coveralls)
const lcovReport = reports.create('lcov', {});
lcovReport.execute(context);
console.log('✅ LCOV report generated: coverage/lcov.info');

// Text summary to console
const textReport = reports.create('text', {});
textReport.execute(context);

// Text summary to file
const textSummaryReport = reports.create('text-summary', {});
textSummaryReport.execute(context);

console.log('\n✅ Coverage merge completed successfully!\n');
console.log('📁 View HTML report: coverage/lcov-report/index.html');
console.log('📁 Upload to CI: coverage/lcov.info\n');
