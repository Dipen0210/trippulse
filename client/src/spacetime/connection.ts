// SpacetimeDB connection — wire up after `spacetime generate` produces types
//
// Usage (once module is deployed):
//   import { getConnection } from './connection'
//   const conn = getConnection()
//   conn.db.trip.onInsert(handler)
//   conn.reducers.createTrip(name, destination)

const SPACETIMEDB_HOST = import.meta.env.VITE_SPACETIMEDB_HOST || 'ws://localhost:3000'
const MODULE_NAME = import.meta.env.VITE_SPACETIMEDB_MODULE || 'trippulse'

let _connection: unknown = null

export function getSpacetimeConfig() {
  return { host: SPACETIMEDB_HOST, moduleName: MODULE_NAME }
}

// Will be replaced with real DBConnection.builder() once types are generated
export function getConnection() {
  return _connection
}

export function setConnection(conn: unknown) {
  _connection = conn
}
