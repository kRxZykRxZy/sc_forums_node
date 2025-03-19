## Migration queries

These are queries I made to change the database schema. These won't be necessary unless you set up your database after these changes.

1. Adding is404 column
`ALTER TABLE posts ADD COLUMN is404 BOOLEAN NOT NULL;`