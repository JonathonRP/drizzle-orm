import { GetColumnData } from '~/column';
import { OptionalKeyOnly, RequiredKeyOnly } from '~/operations';
import { Table } from '~/table';
import { Update } from '~/utils';
import { Simplify } from '~/utils';
import { CheckBuilder } from './checks';
import { AnyPgColumn, AnyPgColumnBuilder, BuildColumns } from './columns/common';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder } from './indexes';
import { PrimaryKeyBuilder } from './primary-keys';

export type PgTableExtraConfig = Record<
	string,
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
>;

export interface TableConfig<TName extends string = string> {
	name: TName;
	columns: Record<string, AnyPgColumn<{ tableName: TName }>>;
}

export type UpdateTableConfig<T extends TableConfig, TUpdate extends Partial<TableConfig>> = Update<T, TUpdate>;

/** @internal */
export const InlineForeignKeys = Symbol('InlineForeignKeys');

/** @internal */
export const ExtraConfigBuilder = Symbol('ExtraConfigBuilder');

export class PgTable<T extends Partial<TableConfig>> extends Table<T['name']> {
	declare protected $columns: T['columns'];

	/** @internal */
	static override readonly Symbol = Object.assign(Table.Symbol, {
		InlineForeignKeys: InlineForeignKeys as typeof InlineForeignKeys,
		ExtraConfigBuilder: ExtraConfigBuilder as typeof ExtraConfigBuilder,
	});

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<T['columns']>;

	/**@internal */
	[InlineForeignKeys]: ForeignKey[] = [];

	/** @internal */
	[ExtraConfigBuilder]: ((self: Record<string, AnyPgColumn>) => PgTableExtraConfig) | undefined = undefined;
}

export type AnyPgTable<TPartial extends Partial<TableConfig> = {}> = PgTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type PgTableWithColumns<T extends TableConfig> =
	& PgTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

/**
 * See `GetColumnConfig`.
 */
export type GetTableConfig<T extends AnyPgTable, TParam extends keyof TableConfig | undefined = undefined> = T extends
	PgTableWithColumns<infer TConfig>
	? TParam extends undefined ? TConfig : TParam extends keyof TConfig ? TConfig[TParam] : TConfig
	: never;

export type InferModel<
	TTable extends AnyPgTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TInferMode extends 'insert' ? Simplify<
		& {
			[
				Key in keyof GetTableConfig<TTable, 'columns'> & string as RequiredKeyOnly<
					Key,
					GetTableConfig<TTable, 'columns'>[Key]
				>
			]: GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>;
		}
		& {
			[
				Key in keyof GetTableConfig<TTable, 'columns'> & string as OptionalKeyOnly<
					Key,
					GetTableConfig<TTable, 'columns'>[Key]
				>
			]?: GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>;
		}
	>
	: {
		[Key in keyof GetTableConfig<TTable, 'columns'>]: GetColumnData<
			GetTableConfig<TTable, 'columns'>[Key],
			'query'
		>;
	};

const isPgSchemaSym = Symbol('isPgSchema');
export interface PgSchema {
	schemaName: string;
	/** @internal */
	[isPgSchemaSym]: true;
}

export function isPgSchema(obj: unknown): obj is PgSchema {
	return !!obj && typeof obj === 'function' && isPgSchemaSym in obj;
}

export function pgSchema<T extends string = string>(
	schemaName: T extends 'public'
		? "You can't specify 'public' as schema name. Postgres is using public schema by default. If you want to use 'public' schema, just type pgTable() instead of creating own schema"
		: T,
) {
	if (schemaName === 'public') {
		throw Error(`You can't specify 'public' as schema name. Postgres is using public schema by default`);
	}

	const schemaValue: PgSchema = {
		schemaName,
		[isPgSchemaSym]: true,
	};

	const columnFactory = <
		TTableName extends string,
		TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => PgTableExtraConfig,
	) => pgTableWithSchema(name, columns, schemaName, extraConfig);
	return Object.assign(columnFactory, schemaValue);
}

function pgTableWithSchema<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
	schema?: string,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => PgTableExtraConfig,
): PgTableWithColumns<{
	name: TTableName;
	columns: BuildColumns<TTableName, TColumnsMap>;
}> {
	const rawTable = new PgTable<{
		name: TTableName;
		columns: BuildColumns<TTableName, TColumnsMap>;
	}>(name, schema);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilder]) => {
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as BuildColumns<TTableName, TColumnsMap>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;

	if (extraConfig) {
		table[PgTable.Symbol.ExtraConfigBuilder] = extraConfig as (self: Record<string, AnyPgColumn>) => PgTableExtraConfig;
	}

	return table;
}

export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => PgTableExtraConfig,
): PgTableWithColumns<{
	name: TTableName;
	columns: BuildColumns<TTableName, TColumnsMap>;
}> {
	return pgTableWithSchema(name, columns, undefined, extraConfig);
}
