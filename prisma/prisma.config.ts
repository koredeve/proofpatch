import { defineConfig } from '@prisma/config';

export default defineConfig({
  schema: './schema.prisma',
  migrationSources: [
    {
      filesystem: './migrations'
    }
  ],
  db: {
    url: process.env.DATABASE_URL
  }
});
