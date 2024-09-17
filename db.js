const { Pool } = require('pg');
const pool = new Pool({
    host:"localhost",
    port:8080,
    user:"postgres",
    password:"Prad@2002",
    database:"signup"
    
})

module.exports = pool;