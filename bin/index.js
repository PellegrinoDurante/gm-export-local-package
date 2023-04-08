#! /usr/bin/env node
const { program } = require('commander');
const exportLocalPackage = require('./commands/export');

program
    .command('export')
    .description('Export a local package')
    .requiredOption('-P, --project-path <path>', 'path of the project root')
    .option('-a, --assets-pattern <glob-pattern>', 'glob pattern of the assets to be included in the package', '*')
    .requiredOption('-d, --package-display-name <display-name>', 'local package display name')
    .requiredOption('-i, --package-id <id>', 'local package ID')
    .requiredOption('-p, --package-publisher-name <publisher-name>', 'local package publisher name')
    .requiredOption('-v, --package-version <version>', 'local package version')
    .requiredOption('-o, --output-file <file-path>', 'local package output file path')
    .action(exportLocalPackage);

program.parse();