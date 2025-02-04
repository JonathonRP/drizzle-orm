import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { PostgresJsDatabase } from './driver';

export async function migrate(db: PostgresJsDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
