const express = require("express");  //inportar librerias y crear servidor
const cors=require("cors"); //  cors permite contectar el html con el servidor
const app = express(); //envia y recibes datos
const PORT=process.env.PORT || 3000;
const basedatos = require("./basedatos");  /// servidor conectado a base datos
const bcrypt = require("bcryptjs");  // encriptacion de contraseñas
const PDFDocument=require("pdfkit"); // generar PDF
const fs=require("fs"); // generar PDF
const multer=require('multer');
const upload= multer({dest: 'public/'}); //carpeta en se guardan imagenes

app.use(cors());
app.use(express.json());

//prueba del servidor
app.get("/", (req, res) =>{
    res.send("Servidor funcionando correctamente");
});

// registro de usuarios//
app.post("/register", (req,res)=>{
    const{
        nombre,
        apellido,
        correo,
        direccion,
        telefono,
        pass,
        pass2
    } =req.body
    
    // validacion basica
    if(!nombre || !apellido  || !correo || !direccion || !telefono || !pass || !pass2){
        return res.status(400).json({
            success: false,
            message:"Todos los campos son obligatorios"
        });
    }
    
    //validacion contraseñas
    if(pass !== pass2){
        return res.status(400).json({
            success: false,
            message:"Las contraseñas no coinciden"
        });
    }

    // verificacion correo no repetido
        basedatos.query(
            "SELECT * FROM usuario WHERE correo=?",
            [correo],
            async (err, results) =>{
                if(err){
                    console.error(err);
                    return res.status(500).json({
                        success: false,
                        message: "Error base datos"
                    });
                }

                // si ya existe envia error
                if(results.length>0){
                    return res.status(400).json({
                        success:false,
                        message:"Correo ya registrado"
                    });
                }

                // encriptar contraseña
                const hash=await bcrypt.hash(pass,10);
                
                //obtener rol
                basedatos.query("INSERT INTO usuario(nombre,apellido,correo,direccion,telefono,password,rol_id) VALUES(?,?,?,?,?,?,?)",
                [nombre, apellido, correo, direccion, telefono, hash, 1],
                (err2)=>{
                    if(err2){
                        console.error(err2);
                        return res.status(500).json({
                            success:false,
                            message:"Error al registrar"
                        });
                    }
                    res.json({
                        success:true,
                        message:"Usuario registrado correctamente"
                    });
                });
            }
        );
});

        // -------------login-----------------
        app.post("/login",(req, res)=>{
            const{correo,pass}=req.body;

            if(!correo || !pass){
                return res.status(400).json({
                    success: false,
                    message: "Todos los campos obligatorios"
                });
            }

            basedatos.query(
                `SELECT usuario.*,rol.nombre AS rol_nombre 
                FROM usuario JOIN rol ON usuario.rol_id = rol.id 
                WHERE usuario.correo=?`,
                [correo],
                async(err, result) =>{
                    if(err){
                        console.error(err);
                        return res.status(500).json({
                            success: false,
                            message: "Error base datos"
                        });
                    }

                    // ------validacion
                    if(result.length === 0){
                        return res.status(400).json({
                            success:false,
                            message:"correo o contraseña incorrectos"
                        });
                    }
                    const usuario=result[0];
                    const valid=await bcrypt.compare(pass,usuario.password);
                    //const valid=pass=== usuario.password;

                    if(!valid){
                        return res.status(400).json({
                            success: false,
                            message: "Correo o contraseña incorrectos"
                        });
                    }
                    res.json({
                        success: true,
                        message: "Login exitoso",
                        user:{
                            id: usuario.id,
                            nombre: usuario.nombre,
                            correo: usuario.correo,
                            direccion:usuario.direccion,
                            telefono:usuario.telefono,
                            rol: usuario.rol_nombre,
                            rol_id: usuario.rol_id
                        }
                    });
                }
            )
        });

        // obtener categorias
        app.get("/categoria", (req, res)=>{
            basedatos.query(
                "SELECT * FROM categoria",
                (err, result) =>{
                    if(err){
                        console.error(err);
                        return res.status(500).json({success:false});
                    }
                    res.json(result);
                }
            );
        });

        // productos por categorias
        app.get('/producto/categoria/:categoriaId', (req, res)=>{         
            const {categoriaId}= req.params;
            console.log("Categoria recibida:", categoriaId);

            basedatos.query(
                "SELECT * FROM producto WHERE categoria_id= ?",
                [categoriaId],
                (err, results)=>{
                    if(err){
                        console.error(err);
                        return res.status(500).json({success:false});
                    }
                    res.json(results);
                }
            );
        });

        //checkout
        app.post("/checkout", async (req, res)=>{
            let {tipo, usuario, carrito, total, metodo_pago} = req.body;
            metodo_pago=metodo_pago.toLowerCase();
            const clienteId = usuario || null;
           
            if(!carrito || carrito.length ===0){
                return res.json({success:false, message:"Carrito Vacío"});
            }

            try{
         ///-----------------verificar stock-------------------
                for(const item of carrito){
                    const [producto]=await new Promise((resolve,reject)=>{
                        basedatos.query(
                            "SELECT stock FROM producto WHERE id=?",
                            [item.id],
                            (err,result)=>{
                                if(err)reject(err);
                                else resolve(result);
                            }
                        );
                    });
                    if(!producto){
                        return res.json({
                            success:false,
                            message:`Producto no encontrado`
                        });
                    }
                    if(producto.stock<item.cantidad){
                        return res.json({
                            success:false,
                            message:`Stock insuficiente para ${item.nombre}`
                        });
                    }
                }
                
                // crear pedido
                const pedidoId=await new Promise((resolve,reject)=>{
                    basedatos.query(
                        "INSERT INTO pedido (cliente_id, tipo, total, metodo_pago) VALUES (?,?,?,?)",
                        [clienteId, tipo, total, metodo_pago],
                        (err,result)=>{
                            if(err)reject(err);
                            else resolve(result.insertId);
                        }
                    );
                });

                ///---insertar detalle y restar stock
                for(const item of carrito){
                    await new Promise((resolve,reject)=>{
                        basedatos.query(
                            `INSERT INTO pedido_detalle
                            (pedido_id, producto_id, producto, precio, cantidad)
                            VALUES (?,?,?,?,?)`,
                            [pedidoId, item.id, item.nombre, item.precio, item.cantidad],
                            (err)=>{
                                if(err) reject(err);
                                else resolve();
                            }
                        );
                    });
                    await new Promise((resolve,reject)=>{
                        basedatos.query(
                            "UPDATE producto SET stock = stock - ? WHERE id=?",
                            [item.cantidad, item.id],
                            (err)=>{
                                if(err) reject(err);
                                else resolve();
                            }
                        );
                    });
                }
                res.json({success:true});
            }catch(error){
                console.error(error);
                res.json({success:false, message:"Error en la venta"})
            }
        });    

        const path = require('path');
        
        app.use('/img', express.static(path.join(__dirname, 'public')));

        //barra de busqueda producto
        app.get("/producto/buscar/:text",(req,res)=>{
            const texto=req.params.text;
            const sql="SELECT * FROM producto WHERE nombre LIKE ?";

            basedatos.query(sql,[`%${texto}%`],(err,result)=>{
                if(err) return res.json([]);
                res.json(result);
            });
        });

        //numero cantidad por metodo de pago
        app.get("/ventas/hoy",(req,res)=>{
            const sql=`
                SELECT id, total, metodo_pago, fecha 
                FROM pedido
                WHERE DATE(fecha)=CURDATE()
                ORDER BY fecha DESC`;

            basedatos.query(sql,(err,result)=>{
            if(err){
                console.error(err);
                return res.json([]);
            }
            res.json(result);
        });
    });

    function generarPDFventas(ventas){

        if(!fs.existsSync("reporte")){
            fs.mkdirSync("reporte");
        };

        const fecha=new Date(). toISOString().slice(0,10);
        const doc =new PDFDocument();
        const nombrearchivo= `ventas_${fecha}.pdf`;
        let totaldia=0;

        doc.pipe(fs.createWriteStream(`reporte/${nombrearchivo}`));
        doc.fontSize(20).text("Reporte de ventas del dia", {align:"center"});
        doc.moveDown();

        ventas.forEach((v,i) => {
            doc.fontSize(12).text(
                `${i+1} | Venta #${v.id} | $${Number(v.total).toLocaleString()} | ${v.metodo_pago} | ${new Date(v.fecha).toLocaleTimeString()}`
            );
            totaldia+=Number(v.total);
        });
        doc.text(`Fecha: ${fecha}`);
        doc.moveDown();
        doc.fontSize(14).text(`TOTAL DEL DIA: $${totaldia.toLocaleString()}`, {align:"right"});
        doc.end();

    }

    app.get("/reporte/hoy",(req,res)=>{
        const sql=`SELECT id,total,metodo_pago,fecha
        FROM pedido WHERE DATE(fecha)=CURDATE()`;

        basedatos.query(sql,(err,ventas)=>{
            if(err){
                return res.status(500).json({success:false});
            }
            generarPDFventas(ventas);
            res.json({
                success:true,
                archivo:`ventas_${new Date().toISOString().slice(0,10)}.pdf`
            });
        });
    });

    // administrador
    app.post("/admin/producto", upload.single('imagen'),(req,res)=>{
        const {nombre,precio,stock,categoria_id}=req.body;
        const imagen=req.file ? req.file.filename : "default.png";

        basedatos.query(
        "INSERT INTO producto (nombre,precio,stock,categoria_id,imagen) VALUES(?,?,?,?,?)",
        [nombre,precio,stock,categoria_id,imagen],
        (err)=>{
        if(err){
            console.error(err);
            return res.json({success:false});
        }
            res.json({success:true});
        });
    });

    //editar producto ruta servi
    app.put("/admin/producto/:id",(req,res)=>{
        const {nombre,precio}=req.body;
        const id=req.params.id;

        basedatos.query(
            "UPDATE producto SET nombre=?,precio=? WHERE id=?",
                [nombre,precio,id],
            (err)=>{
                if(err){
                    console.error(err);
                    return res.json({success:false});
                }
                res.json({success:true});
        });
    });

    // eliminiar producto - admin
    app.delete("/admin/producto/:id",(req,res)=>{
        const id=req.params.id;

        basedatos.query(
            "DELETE FROM producto WHERE id=?",
            [id],
            (err)=>{
                if(err){
                console.error(err);
                return res.json({success:false});
                }
                res.json({success:true});
            });
    });

    // ajustar stock
    app.put("/admin/stock/:id",(req,res)=>{
        const {stock}=req.body;
        const id=req.params.id;

        basedatos.query(
            "UPDATE producto SET stock=? WHERE id=?",
            [stock,id],
            (err)=>{
            if(err){
                console.error(err);
                return res.json({success:false});
            }
            res.json({success:true});
        });
    });

    //ver lista productos panel admin
app.get("/admin/productos",(req,res)=>{
    basedatos.query(
        `SELECT producto.*,categoria.nombre AS categoria
        FROM producto 
        JOIN categoria ON producto.categoria_id=categoria.id`,

        (err,result)=>{
            if(err){
                console.error(err);
                return res.json([]);
            }
            res.json(result);
        });
});

    // ver usuarios admin
    app.get("/admin/usuarios",(req,res)=>{
        basedatos.query(
        "SELECT id,nombre,apellido, correo, direccion, telefono FROM usuario",
            (err,result)=>{
            if(err){
                console.error(err);
                return res.json([]);
            }
            res.json(result);
        });
    });

    //eliminar usuario
    app.delete("/admin/usuario/:id",(req,res)=>{
        const id=req.params.id;

        basedatos.query(
            "DELETE FROM usuario WHERE id=?",
            [id],
            (err)=>{
                if(err){
                    console.error(err);
                    return res.json({success:true});
                }
            }
        );
    });

    // iniciar servidor
        app.listen(PORT,()=>{
        console.log(`Servidor corriendo en puerto ${PORT}`);
});
