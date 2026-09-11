Category Admin API

Method	Route	Status

GET	/admin/categories	✅
GET	/admin/categories/count	✅
GET	/admin/categories/uuid/:uuid	✅
GET	/admin/categories/:id/edit	✅ placeholder
GET	/admin/categories/new	✅ placeholder
GET	/admin/categories/:id	✅
POST	/admin/categories	✅
PATCH	/admin/categories/:id	✅
DELETE	/admin/categories/:id	✅
POST	/admin/categories/:id/restore	✅
POST	/admin/categories/:id/activate	✅
POST	/admin/categories/:id/deactivate	✅

PUBLIC API
GET    /api/categories
GET    /api/categories/:id
GET    /api/categories/slug/:slug
GET    /api/categories/uuid/:uuid
GET    /api/categories/count

ADMIN
GET    /admin/categories
GET    /admin/categories/:id
GET    /admin/categories/uuid/:uuid
GET    /admin/categories/count

POST   /admin/categories
PATCH  /admin/categories/:id
DELETE /admin/categories/:id

POST   /admin/categories/:id/restore
POST   /admin/categories/:id/activate
POST   /admin/categories/:id/deactivate