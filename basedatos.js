const mysql =require("mysql2");

const basedatos = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,  // contraseña cuenta
    database: process.env.DB_NAME
});

basedatos.connect(err =>{
    if(err){
        console.error("Error Base Datos:", err);
        return;
    }
        console.log("Conectado base datos");
});
module.exports = basedatos;
