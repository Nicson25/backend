const mysql =require("mysql2");

const basedatos = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "NuevaClave25",  // contraseña cuenta
    database: "maisonsabor"
});

basedatos.connect(err =>{
    if(err){
        console.error("Error Base Datos:", err);
        return;
    }
        console.log("Conectado base datos");
});
module.exports = basedatos;