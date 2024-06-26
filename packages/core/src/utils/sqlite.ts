import BetterSqlite3 from "better-sqlite3";

import { ensureDirExists } from "./exists.js";
import { prettyPrint } from "./print.js";

function improveSqliteErrors(database: BetterSqlite3.Database) {
  const originalPrepare = database.prepare;
  // @ts-ignore
  database.prepare = (source: string) => {
    let statement: any;
    try {
      statement = originalPrepare.apply(database, [source]);
    } catch (error_) {
      // This block is reachable if the database is closed, and possibly in other cases.
      const error = error_ as Error & { detail?: string; meta?: string };
      error.name = "SqliteError";
      Error.captureStackTrace(error);

      const metaMessages = [];
      if (error.detail) metaMessages.push(`Detail:\n  ${error.detail}`);
      metaMessages.push(`Statement:\n  ${source}`);
      error.meta = metaMessages.join("\n");

      throw error;
    }

    const wrapper =
      (fn: (...args: any) => void) =>
      (...args: any) => {
        try {
          return fn.apply(statement, args);
        } catch (error_) {
          const error = error_ as Error & { detail?: string; meta?: string };
          error.name = "SqliteError";

          let parameters = (args[0] ?? []) as string[];
          parameters =
            parameters.length <= 25
              ? parameters
              : parameters.slice(0, 26).concat(["..."]);
          const params = parameters.reduce<Record<number, any>>(
            (acc, parameter, idx) => {
              acc[idx + 1] = parameter;
              return acc;
            },
            {},
          );

          const metaMessages = [];
          if (error.detail) metaMessages.push(`Detail:\n  ${error.detail}`);
          metaMessages.push(`Statement:\n  ${source}`);
          metaMessages.push(`Parameters:\n${prettyPrint(params)}`);

          error.meta = metaMessages.join("\n");

          throw error;
        }
      };

    for (const method of ["run", "get", "all"]) {
      // @ts-ignore
      statement[method] = wrapper(statement[method]);
    }

    return statement;
  };
}

export type SqliteDatabase = BetterSqlite3.Database;

export function createSqliteDatabase(
  file: string,
  options?: BetterSqlite3.Options,
): SqliteDatabase {
  ensureDirExists(file);
  const database = new BetterSqlite3(file, options);
  improveSqliteErrors(database);
  database.pragma("journal_mode = WAL");
  return database;
}
