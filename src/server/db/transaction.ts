import type { PoolConnection } from "mariadb";
import { getDbPool } from "./pool";

export async function withDbTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getDbPool().getConnection();
  let transactionOpen = false;

  try {
    await connection.beginTransaction();
    transactionOpen = true;
    const result = await work(connection);
    await connection.commit();
    transactionOpen = false;
    return result;
  } catch (cause) {
    if (transactionOpen) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        throw new AggregateError([cause, rollbackError], "Database operation failed and rollback could not be confirmed.");
      }
    }
    throw cause;
  } finally {
    await connection.release();
  }
}
