# My cookery book 2 - migration util
Application writen in Node.js for migrating data from my-cookery-book to my-cookery-book-2

## Technologies required for development
* Node.js (>=18)

## How to run migration

Configure .env file with correct evironmental properties

|ENVIROMENTAL PROPERTY NAME|VALUE|
|---|---|
|OLD_DB_USER|recipes|
|OLD_DB|recipes|
|OLD_DB_PASS|your_passwd|
|OLD_DB_PORT|5432|
|OLD_DB_HOST|localhost|
|NEW_API_BASE_PATH|http://localhost:8080/api|
|NEW_USER_PASSWORD|passwd_of_users|

* `npm install` (only if you didn't run it before or you modifed package.json file)
* `npm run generate-openapi` (only if you didn't run it before or backend api was modified)
* `npm start`

Run this only once, against old database and api of new running instance of my-cookery-book-2-backend without data yet.

## License
Project is licensed under [MIT](./LICENSE) License.