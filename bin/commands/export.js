const fs = require("fs");
const fse = require("fs-extra");
const archiver = require("archiver");
const os = require("os");
const path = require("path");
const chalk = require("chalk");
const JSON5 = require("json5");
const globObject = require("glob-object");

async function exportLocalPackage(options) {
  const {
    projectPath,
    assetsPattern,
    packageDisplayName,
    packageId,
    packagePublisherName,
    packageVersion,
    outputFile,
  } = options;

  if (!fs.existsSync(projectPath)) {
    return console.log(
      chalk.red(`Project path ${projectPath} does not exist!`)
    );
  }

  const metadataFileName = fs
    .readdirSync(projectPath)
    .find((filename) => filename.endsWith(".yyp"));

  if (!metadataFileName) {
    return console.log(chalk.red(`Project's metadata file not found!`));
  }

  console.log(chalk.green("Project detected!"));

  const projectMetadataFile = fs.readFileSync(
    path.join(projectPath, metadataFileName)
  );
  const projectMetadata = JSON5.parse(projectMetadataFile);

  const resources = getResources(projectMetadata, projectPath, assetsPattern);

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "gm_local_package_exporter")
  );

  // Get selected resources
  const selectedResources = getResourceList(resources);

  // Get selected folders
  const selectedFolders = getFolderList(resources);

  // Create local package project metadata file (.yyp file)
  const localPackageProjectMetadata = computeLocalPackageProjectMetadata(
    projectMetadata,
    selectedResources,
    selectedFolders,
    packageDisplayName,
    packageId,
    packagePublisherName,
    packageVersion
  );

  fs.writeFileSync(
    path.join(tempDir, metadataFileName),
    JSON.stringify(localPackageProjectMetadata)
  );

  // Create local package metadata file (metadata.json)
  const localPackageMetadata = computeLocalPackageMetadata(
    localPackageProjectMetadata
  );

  fs.writeFileSync(
    path.join(tempDir, "metadata.json"),
    JSON.stringify(localPackageMetadata)
  );

  // Copy resources file in temp dir
  for (const resource of selectedResources) {
    fs.mkdirSync(path.join(tempDir, path.dirname(resource.path)), {
      recursive: true,
    });
    fse.copy(
      path.join(projectPath, path.dirname(resource.path)),
      path.join(tempDir, path.dirname(resource.path))
    );
  }

  // Create local package export file (.yymps)
  const localPackageOutputFilePath = await createLocalPackageOutputFile(
    tempDir,
    outputFile
  );

  console.log(chalk.green.bold(`Local package exported in ${localPackageOutputFilePath}`));
}

function createLocalPackageOutputFile(tempDir, outputFile) {
  return new Promise((resolve, reject) => {
    // Output file
    const localPackageFile = fs.createWriteStream(outputFile);
    localPackageFile.on("close", () => resolve(outputFile));
    localPackageFile.on("error", reject);

    // Zip local package files
    const archive = archiver("zip");
    archive.pipe(localPackageFile);
    archive.directory(tempDir, false);
    archive.finalize();
  });
}

function getResources(projectMetadata, projectPath, assetsPattern) {
  // Build resource tree
  let resources = {};
  projectMetadata.Folders.forEach(({ folderPath }, i) => {
    const subfolders = getResourceSubfolders(folderPath);

    let currentSubfolder = resources;
    subfolders.forEach((subfolder) => {
      // Add subfolder otherwise if subfolder does not exist yet
      if (!currentSubfolder.hasOwnProperty(subfolder)) {
        currentSubfolder[subfolder] = {};
      }

      currentSubfolder = currentSubfolder[subfolder];
    });
  });

  projectMetadata.resources.forEach(({ id: resourceId }) => {
    const resourceFile = fs.readFileSync(
      path.join(projectPath, resourceId.path)
    );
    const resource = JSON5.parse(resourceFile);
    const resourceSubfolders = getResourceSubfolders(resource.parent.path);

    let currentSubfolder = resources;

    for (const resourceSubfolder of resourceSubfolders) {
      currentSubfolder = currentSubfolder[resourceSubfolder];
    }

    currentSubfolder[resource.name] = {
      type: "resource",
      id: resourceId,
    };
  });

  // Filter resources
  return globObject(assetsPattern, resources);
}

function getFolderList(resources, currentPath = "folders") {
  const result = [];

  for (const resourceName in resources) {
    const resource = resources[resourceName];

    if (resource.hasOwnProperty("type") && resource.type === "resource") {
      continue;
    }

    const newCurrentPath = `${currentPath}/${resourceName}`;
    result.push(`${newCurrentPath}.yy`);
    result.push(...getFolderList(resource, newCurrentPath));
  }

  return result;
}

function getResourceList(resources) {
  const result = [];

  for (const resourceName in resources) {
    const resource = resources[resourceName];

    if (resource.hasOwnProperty("type") && resource.type === "resource") {
      result.push(resource.id);
    } else {
      result.push(...getResourceList(resource));
    }
  }

  return result;
}

function computeLocalPackageProjectMetadata(
  projectMetadata,
  selectedResources,
  selectedFolders,
  packageDisplayName,
  packageId,
  packagePublisherName,
  packageVersion
) {
  function resourceIdEqual(a, b) {
    return a.name === b.name && a.path === b.path;
  }

  // Filter project metadata
  projectMetadata.resources = projectMetadata.resources.filter((resource) =>
    selectedResources.some((sr) => resourceIdEqual(sr, resource.id))
  );
  projectMetadata.Folders = projectMetadata.Folders.filter((folder) =>
    selectedFolders.some((sf) => sf === folder.folderPath)
  );
  projectMetadata.RoomOrderNodes = projectMetadata.RoomOrderNodes.filter(
    (node) => selectedResources.some((sr) => resourceIdEqual(sr, node.roomId))
  );
  projectMetadata.Options = []; // TODO verify
  projectMetadata.MetaData.PackageType = "Asset";
  projectMetadata.MetaData.PackageName = packageDisplayName;
  projectMetadata.MetaData.PackageID = packageId;
  projectMetadata.MetaData.PackagePublisher = packagePublisherName;
  projectMetadata.MetaData.PackageVersion = packageVersion;

  return projectMetadata;
}

function computeLocalPackageMetadata(packageProjectMetadata) {
  return {
    package_id: packageProjectMetadata.MetaData.PackageID,
    display_name: packageProjectMetadata.MetaData.PackageName,
    version: packageProjectMetadata.MetaData.PackageVersion,
    package_type: "asset",
    ide_version: packageProjectMetadata.MetaData.IDEVersion,
  };
}

function getResourceSubfolders(path) {
  // First folder is always folders" and last folder ends with ".yy"
  // e.g. folders/MyScripts/AnotherSubfolder.yy
  const subfolders = path.split("/").slice(1);
  subfolders[subfolders.length - 1] = subfolders[subfolders.length - 1].replace(
    ".yy",
    ""
  );
  return subfolders;
}

module.exports = exportLocalPackage;
