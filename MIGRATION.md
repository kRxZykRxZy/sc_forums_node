## Migration queries

These are queries I made to change the database schema. These won't be necessary unless you set up your database after these changes.

2. Allowing topic_id to be null
`ALTER TABLE posts MODIFY COLUMN topic_id INT;`

1. Adding is404 column
`ALTER TABLE posts ADD COLUMN is404 BOOLEAN NOT NULL;`