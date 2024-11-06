import path from 'path';
import {
  IndentationText,
  Project,
  QuoteKind,
  SourceFile,
} from 'ts-morph';
import { consola } from 'consola';
import migrateProps from './vue-property-decorator/prop';
import migratePropSyncs from './vue-property-decorator/propSync';
import migrateModels from './vue-property-decorator/model';
import migrateModelSyncs from './vue-property-decorator/modelSync';
import migrateRefs from './vue-property-decorator/ref';
import migrateWatchers from './vue-property-decorator/watch';
import migrateData from './vue-class-component/migrate-data';
import migrateExtends from './vue-class-component/migrate-extends';
import migrateGetters from './vue-class-component/migrate-getters';
import migrateImports from './vue-class-component/migrate-imports';
import migrateMethods from './vue-class-component/migrate-methods';
import migrateSetters from './vue-class-component/migrate-setters';
import migrateVuexDecorators from './vuex';
import { getScriptContent, injectScript, vueFileToSFC } from './migrator-to-sfc';
import { createMigrationManager } from './migratorManager';
import {
  canBeCliOptions, DirectoryModeOption, FileModeOption, OptionParser,
} from './option';

const migrateTsFile = async (project: Project, sourceFile: SourceFile): Promise<SourceFile> => {
  const filePath = sourceFile.getFilePath();
  const { name, ext } = path.parse(path.basename(filePath));
  const outPath = path.join(path.dirname(filePath), `${name}_migrated${ext}`);
  const outFile = project.createSourceFile(outPath, sourceFile.getText(), { overwrite: true });

  try {
    const migrationManager = createMigrationManager(sourceFile, outFile);

    // NOTE: Order along to Vue style guide: https://ja.vuejs.org/style-guide/rules-recommended.html
    migrateImports(migrationManager.outFile);
    // Structures(extends, mixins)
    migrateExtends(migrationManager.clazz, migrationManager.mainObject);
    // Interfaces(emits, props)
    migrateProps(migrationManager);
    migratePropSyncs(migrationManager);
    // Local states(data, computed)
    migrateData(migrationManager.clazz, migrationManager.mainObject);
    migrateGetters(migrationManager);
    migrateSetters(migrationManager.clazz, migrationManager.mainObject);
    migrateRefs(migrationManager);
    // Callbacks triggered reactively
    migrateWatchers(migrationManager);
    // Non-reactive properties(methods)
    migrateMethods(migrationManager.clazz, migrationManager.mainObject);
    migrateModels(migrationManager);
    migrateModelSyncs(migrationManager);
    migrateVuexDecorators(migrationManager);
  } catch (error) {
    await outFile.deleteImmediately();
    throw error;
  }
  return outFile.moveImmediately(sourceFile.getFilePath(), { overwrite: true });
};

const migrateVueFile = async (project: Project, vueSourceFile: SourceFile): Promise<SourceFile> => {
  const scriptContent = getScriptContent(vueSourceFile);
  if (!scriptContent) {
    throw new Error('Unable to extract script tag content');
  }
  const filePath = vueSourceFile.getFilePath();
  const { name } = path.parse(path.basename(filePath));
  const outPath = path.join(path.dirname(filePath), `${name}_temp_migrated.ts`);
  let outFile = project.createSourceFile(outPath, scriptContent, { overwrite: true });

  try {
    outFile = await migrateTsFile(project, outFile);
    const vueFileText = vueSourceFile.getText();
    vueSourceFile.removeText();
    vueSourceFile.insertText(0, injectScript(outFile, vueFileText));

    await vueSourceFile.save();
    return vueSourceFile;
  } finally {
    await outFile.deleteImmediately();
  }
};

export const migrateFile = async (
  project: Project,
  sourceFile: SourceFile,
): Promise<SourceFile> => {
  consola.info(`Migrating ${sourceFile.getBaseName()}`);
  if (!sourceFile.getText().includes('@Component')) {
    throw new Error('File already migrated');
  }

  const ext = sourceFile.getExtension();

  if (ext === '.ts') {
    return migrateTsFile(project, sourceFile);
  }

  if (ext === '.vue') {
    return migrateVueFile(project, sourceFile);
  }

  throw new Error(`Extension ${ext} not supported`);
};

const migrateEachFile = (
  filesToMigrate: SourceFile[],
  project: Project,
): Promise<SourceFile>[] => {
  const resolveFileMigration = (s: SourceFile, p: Project) => migrateFile(p, s)
    .catch((err) => {
      consola.error(`Error migrating ${s.getFilePath()}`);
      return Promise.reject(err);
    });

  return filesToMigrate.map((sourceFile) => resolveFileMigration(sourceFile, project));
};

const createProject = () => new Project({
  manipulationSettings: {
    quoteKind: QuoteKind.Single,
    indentationText: IndentationText.TwoSpaces,
  },
});

export const migrateDirectory = async (directoryPath: string, toSFC: boolean) => {
  const directoryToMigrate = path.join(process.cwd(), directoryPath);
  const project = createProject();

  project.addSourceFilesAtPaths(`${directoryToMigrate}/**/*.(ts|vue|scss)`)
    .filter((sourceFile) => !['.vue', '.ts'].includes(sourceFile.getExtension())
      || sourceFile.getFilePath().includes('node_modules'))
    .forEach((file) => project.removeSourceFile(file));

  const finalFilesToMigrate = project
    .getSourceFiles()
    .filter(
      (file) => ['.vue', '.ts'].includes(file.getExtension())
        && !file.getFilePath().includes('node_modules')
        && file.getText().includes('@Component'),
    );

  consola.info(
    `Migrating directory: ${directoryToMigrate}, ${finalFilesToMigrate.length} Files needs migration`,
  );

  const migrationPromises = migrateEachFile(finalFilesToMigrate, project);

  try {
    await Promise.all(migrationPromises);
  } catch (error) {
    return;
  }

  if (toSFC) {
    const vueFiles = project
      .getSourceFiles()
      .filter(
        (file) => ['.vue'].includes(file.getExtension()),
      );

    consola.info(`Migrating directory: ${directoryToMigrate}, files to SFC`);
    await Promise.all(vueFiles.map((f) => vueFileToSFC(project, f)));
  }
};

export const migrateSingleFile = async (filePath: string, toSFC: boolean): Promise<void> => {
  const fileExtensionPattern = /.+\.(vue|ts)$/;
  if (!fileExtensionPattern.test(filePath)) {
    consola.info(`${filePath} can not migrate. Only .vue files are supported.`);
    return;
  }

  const fileToMigrate = path.join(process.cwd(), filePath);
  const project = createProject();
  project.addSourceFileAtPath(fileToMigrate);
  const sourceFiles = project.getSourceFiles();

  consola.info(`Migrating file: ${fileToMigrate}`);
  const migrationPromises = migrateEachFile(sourceFiles, project);
  await Promise.all(migrationPromises);

  if (toSFC) {
    consola.info(`Migrating file: ${fileToMigrate}, files to SFC`);
    await Promise.all(sourceFiles.map((f) => vueFileToSFC(project, f)));
  }
};

/**
 * Entry function to start migration
 */
export const migrate = async (option: any): Promise<void> => {
  if (!canBeCliOptions(option)) {
    throw new Error('Cli option should be provided. Run --help for more info');
  }
  consola.info('Start migrating Vue class component');
  const result = new OptionParser(option).parse();
  if (Object.keys(result).includes('file')) {
    const fileModeOption = result as FileModeOption;
    migrateSingleFile(fileModeOption.file, (fileModeOption.sfc ?? false));
  } else {
    const directoryModeOption = result as DirectoryModeOption;
    migrateDirectory(directoryModeOption.directory, (directoryModeOption.sfc ?? false));
  }
  consola.success('Migration succeeded');
};
