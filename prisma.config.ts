import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
    // Optional. Only needed when the database server can't create a throwaway
    // shadow DB itself (e.g. `prisma dev`, which has a separate shadow server).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
