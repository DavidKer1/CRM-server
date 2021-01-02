const Usuario = require('../models/Usuario')
const Producto = require('../models/Producto')
const Cliente = require('../models/Cliente')
const Pedido = require('../models/Pedido')
const bcryptjs = require('bcryptjs')
require('dotenv').config({path: 'variables.env'});
const jwt= require('jsonwebtoken');
const { AddArgumentsAsVariables } = require('apollo-server');

const crearToken = (usuario, secreta, expiresIn) =>{
   const {id,nombre,email,apellido} = usuario;
   return jwt.sign({id, email, nombre, apellido},secreta,{expiresIn});
}

// Resolvers
const resolvers = {
   Query: {
      obtenerUsuario: async (_, {}, ctx) => {
         return ctx.usuario
      },
      obtenerProductos: async () => {
         try {
            const productos = await Producto.find({});
            return productos

         } catch (error) {
            console.log(error);
         }
      },
      obtenerProducto: async (_,{id}) =>{
            // revisar su el producto existe
            const producto = await Producto.findById(id)
            if(!producto){
               throw new Error("Producto no encontrado")
            }
            
            return producto;
      },
      obtenerClientes: async () => {
         try {
            const clientes = await Cliente.find({})
            return clientes
         } catch (error) {
            console.log(error);
         }
      },
      obtenerClientesVendedor: async (_,{},ctx) =>{
         try {
            const clientes = await Cliente.find({vendedor: ctx.usuario.id.toString()})
            return clientes
         } catch (error) {
            console.log(error);
         }
      },
      obtenerCliente: async (_,{id}, ctx) => {
         // Revisar si el cliente existe o no
         const cliente = await Cliente.findById(id);

         if(!cliente){
            throw new Error("Cliente no encontrado")

         }
         // Quien lo creo puede verlo
         if(cliente.vendedor.toString() !== ctx.usuario.id){
            throw new Error("No tienes las credenciales")

         }
         return cliente
      },
      obtenerPedidos: async () => {
         try {
            const pedidos = await Pedido.find({});
            return pedidos
         } catch (error) {
            console.log(error);
         }
      },
      obtenerPedidosVendedor: async (_,{},ctx) => {
         try {
            const pedidos = await Pedido.find({vendedor: ctx.usuario.id}).populate('cliente');
            return pedidos
         } catch (error) {
            console.log(error);
         }
      },
      obtenerPedido: async (_,{id}, ctx) =>{
         // Revisar si el pedido existe
         const pedido = await Pedido.findById(id);
         if(!pedido){
            throw new Error('El pedido no existe')
         }

         // Revisar que el pedido sea del vendedor
         if(pedido.vendedor.toString() !== ctx.usuario.id){
            throw new Error('No tiene las credenciales')
         }

         return pedido;
      },
      obtenerPedidosEstado: async (_, {estado}, ctx) =>{
         // Revisar si el pedido existe
         const pedidos = await Pedido.find({ vendedor: ctx.usuario.id, estado});
         console.log(pedidos);
         return pedidos
      },
      mejoresClientes: async () => {
         const clientes = await Pedido.aggregate([
            { $match : { estado: "COMPLETADO" } },
            { $group : {
               _id: "$cliente",
               total: { $sum: '$total'}
            }},
            {
               $lookup: {
                  from: 'clientes',
                  localField: '_id',
                  foreignField: "_id",
                  as: "cliente"
               }
            },
            {
               $limit: 5
            },
            {
               $sort: { total : -1}
            }
         ]);
         return clientes
      },
      mejoresVendedores: async () => {
         const vendedores = await Pedido.aggregate([
            {$match: {estado: "COMPLETADO"}},
            { $group: {
               _id: "$vendedor",
               total: {$sum : '$total'}
            }},
            {
               $lookup: {
                  from: 'usuarios',
                  localField: '_id',
                  foreignField: '_id',
                  as: 'vendedor'
               }
            },
            {
               $limit: 5
            },
            {
               $sort: {total: -1}
            }
         ]);
         return vendedores
      },
      buscarProducto: async (_,{texto}) => {
         const regex = new RegExp(texto,'i');

         const productos = await Producto.aggregate([
            {$match: {nombre: regex}}
         ])
         return productos
      }


    
   },
   Mutation: {
      nuevoUsuario : async (_, {input}) => {
         const {email, password} = input
         // Revisar si el usuario ya está registrado
         const existeUsuario = await Usuario.findOne({email})
         if(existeUsuario){
            throw new Error('El usuario ya está registrado')
         }
         // Hashear su password
         const salt = await bcryptjs.genSalt(10);
         input.password = await bcryptjs.hash(password, salt);

         //Guardar en la base de datos
         try{
            const usuario = new Usuario(input)
            usuario.save(); // Guardarlo
            return usuario
         }catch(error){
            console.log(error);
         }

      },
      autenticarUsuario: async (_, {input}) =>{
         const { email, password} = input
         // Si el usuario existe
         const existeUsuario = await Usuario.findOne({email})
         if(!existeUsuario){
            throw new Error('El usuario no existe')
         }

         // Revisar si el password es correcto
         const passwordCorrecto = await bcryptjs.compare(password, existeUsuario.password);

         if(!passwordCorrecto){
            throw new Error('El password es incorrecto')
         }
         // Crear Token
         return{
            token: crearToken(existeUsuario, process.env.SECRETA, '24h')
         }

      },
      nuevoProducto: async (_, {input})=>{
         try {
            const nuevoProducto = new Producto(input)
            const res = await nuevoProducto.save() // Almacenar
            return res
         } catch (error) {
            console.log(error);
         }
      },
      actualizarProducto: async (_,{id,input}) => {
         let producto = await Producto.findById(id)
         if(!producto){
            throw new Error("Producto no encontrado")
         }

         // guardarlo en la base de datos
         producto = await Producto.findOneAndUpdate({_id: id}, input,{ new: true });
         
         return producto
        
      },
      eliminarProducto: async (_,{id}) =>{
         let producto = await Producto.findById(id)
         if(!producto){
            throw new Error("Producto no encontrado")
         }

         // eliminar el registro
         await Producto.findByIdAndDelete(id)
         return "Producto eliminado";
      },
      nuevoCliente: async (_,{ input },ctx) => {
         // Verificar si el cliente ya esta registrado
         const {email} = input
         const cliente = await Cliente.findOne({email})
         if(cliente){
            throw new Error("Este cliente ya esta registrado")
         }
         const nuevoCliente = new Cliente(input)
         // Asignar el vendedor
         nuevoCliente.vendedor = ctx.usuario.id

         // Guardar en la base de datos
         try {
            const resultado = await nuevoCliente.save()
            return resultado
         } catch (error) {
            console.log(error);
         }
      },
      actualizarCliente: async (_,{id, input}, ctx) => {
         // Verificar si existe o no
         let cliente = await Cliente.findById(id);
         if(!cliente){
            throw new Error("Ese cliente no existe")

         }
         // Verificar si el vendedor es quien edita
         if(cliente.vendedor.toString() !== ctx.usuario.id){
            throw new Error("No tienes las credenciales")

         }

         // Guardar el cliente
         cliente = await Cliente.findOneAndUpdate({_id : id},input, {new: true})
         return cliente
      },
      eliminarCliente: async (_,{id}, ctx) =>{
         let cliente = await Cliente.findById(id)
         if(!cliente){
            throw new Error("Ese cliente no existe")
         }

         if(cliente.vendedor.toString() !== ctx.usuario.id){
            throw new Error("No tienes las credenciales")
         }

         await Cliente.findOneAndRemove({_id : id})
         return "Cliente eliminado correctamente"
      },
      nuevoPedido: async (_,{input}, ctx) => {
         const {cliente} = input
         // Verificar si el cliente existe o no
         let clienteExist = await Cliente.findById(cliente)
         if(!clienteExist){
            throw new Error("Ese cliente no existe")
         }
         // Verificar si el cliente es del vendedor
         if(clienteExist.vendedor.toString() !== ctx.usuario.id){
            throw new Error("No tienes las credenciales")
         }
         // Revisar que el stock este disponible
         for await (const articulo of input.pedido){
            const {id} = articulo
            const producto = await Producto.findById(id)

            if(articulo.cantidad > producto.existencia){
               throw new Error(`El articulo: ${producto.nombre} excede la cantidad disponible`)
            }else {
               // Restar la cantidad a lo disponible
               producto.existencia -= articulo.cantidad

               await producto.save()
            }
         }

         // Crear un nuevo pedido
         const nuevoPedido = new Pedido(input)

         // asignarle un vendedor 
         nuevoPedido.vendedor = ctx.usuario.id
         // Guardar en la base de datos
         const resultado = await nuevoPedido.save();
         return resultado
      },
      actualizarPedido: async (_,{id,input},ctx)=>{
         const {cliente} = input

         
         const pedidoExist = await Pedido.findById(id)
         // Validaciones
         if(!pedidoExist){
            throw new Error('El pedido no existe');
         }
         if(pedidoExist.vendedor.toString()!== ctx.usuario.id){
            throw new Error('Credenciales no validas')
         }
         const clienteExist = await Cliente.findById(cliente)
         if(!clienteExist){
            throw new Error('El cliente no existe');
         }
         if(clienteExist.vendedor.toString() !== ctx.usuario.id){
            throw new Error('Credenciales no validas [Cliente]')
         }

         // Revisar el stock
         if(input.pedido){

            for await (const articulo of input.pedido){
               const {id} = articulo
               const cantidadAnterior = pedidoExist.pedido.find(item => item.id === id).cantidad
               
               const producto = await Producto.findById(id);
               producto.existencia += cantidadAnterior;
               if(articulo.cantidad > producto.existencia){
                  throw new Error(`El articulo: ${producto.nombre} excede la cantidad disponible`)
               } else {
                  producto.existencia -= articulo.cantidad
                  await producto.save()
               }
            }
         }
         const resultado = await Pedido.findOneAndUpdate({_id: id}, input, {new: true})
         return resultado
      },
      eliminarPedido: async(_,{id},ctx) =>{

         const pedidoExist = await Pedido.findById(id)
         // Validaciones
         if(!pedidoExist){
            throw new Error('El pedido no existe');
         }
         if(pedidoExist.vendedor.toString()!== ctx.usuario.id){
            throw new Error('Credenciales no validas')
         }
         console.log(pedidoExist);
         await Pedido.findOneAndDelete({_id: id})
         return "Pedido borrado exitosamente"
      }
   }
};

module.exports = resolvers;

