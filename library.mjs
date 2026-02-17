"use strict";

import sql from "mssql";

import express from "express";
const app = express();
app.use(express.json());

// Database configuration
const config = {
    user: 'library_login',
    password: 'Password123',
    server: '127.0.0.1', // You can use 'localhost' or an IP address
    port: 1433,
    database: 'LIBRARY',
    timeout: 2000,
    options: {
        encrypt: false, // Use true for Azure SQL Database, false for local SQL Server if not using SSL
        trustServerCertificate: true // Change to true for local dev / self-signed certs
    }
};

// подключимся к СУБД
async function connect() {
    try {
        //aerotaxi.pool = await sql.connect(config);
        await sql.connect(config);
        console.log('Connected to SQL Server.');
        
    } catch (err) {
        console.error('Database error:', err);
        await sql.close();
        console.log('Connection closed.');
    }
}

// отключимся от СУБД
async function disconnect() {
    try {
        await sql.close();
        console.log('Disconnected from SQL Server.');
        
    } catch (err) {
        console.error('Database error:', err);
    }
}

async function addGenre(args) {
    let query = `insert into GENRE(TYPE)
        output inserted.id
        values ('${args[0]}');`

    try {
        // создаем и выполняем запрос
        const request = new sql.Request();
        const result = await request.query(query);

        console.log("Жанр добавлен, id: ", result.recordset[0].id);
        return result.recordset[0].id;
    } catch (e) {
        console.log("Что-то сломалось: " + e.message);
    }
}

async function addAuthor(args) {
    let query = `insert into AUTHORS(NAME_A)
        output inserted.ID
        values ('${args[0]}');`;

    try {
        const request = new sql.Request();
        const result = await request.query(query);
        console.log("Автор добавлен, id:", result.recordset[0].ID);
        return result.recordset[0].id;
    } catch (e) {
        console.log("Ошибка:", e.message);
    }
}

async function findAuthor(name) {
    let query = `
        select id from AUTHORS
        where name_a = '${name}';
    `;

    try {
        const request = new sql.Request();
        const result = await request.query(query);
        return result.recordset[0].id;
    } catch (e) {
        console.log("Ошибка в findAuthor:", e.message);
    }
}

async function findGenre(name) {
    let query = `
        select id from GENRE
        where type = '${name}';
    `;

    try {
        const request = new sql.Request();
        const result = await request.query(query);
        return result.recordset[0].id;
    } catch (e) {
        console.log("Ошибка в findGenre:", e.message);
    }
}

// args: author title genre amount date
async function addBook(args) {
    let authorId = await findAuthor(args[0]);
    if (authorId == null)
        authorId = await addAuthor(args[0]);

    let genreId = await findGenre(args[2]);
    if (genreId == null)
        genreId = await addGenre(args[2]);

    let query = `insert into books(author, title, genre, amount, d)
        output inserted.isbn
        values (${authorId}, '${args[1]}', ${genreId}, ${args[3]}, '${args[4]}');`;

    try {
        const request = new sql.Request();
        const result = await request.query(query);
        console.log("Книжка добавлена, id:", result.recordset[0].isbn);
    } catch (e) {
        console.log("Ошибка:", e.message);
    }
}

async function addUser(args) {
    let query = `insert into USERS(NAME_U, PASSWORD, EMAIL, REGIST_DATE)
        output inserted.*
        values ('${args[0]}', '${args[1]}', '${args[2]}', getdate());`;

    try {
        const request = new sql.Request();
        const result = await request.query(query);
        console.log("Пользователь добавлен, id:", result.recordset[0]);
        return result.recordset[0].ID;
    } catch (e) {
        console.log("Ошибка при добавлении пользователя:", e.message);
    }
}

app.post("/register", async(req, res) => { 
    const {name, password, email} = req.body;

    let query = `insert into USERS(NAME_U, PASSWORD, EMAIL, REGIST_DATE)
        output inserted.*
        values ('${name}', '${password}', '${email}', getdate());`;

    try {
        await connect();
        const request = new sql.Request();
        const result = await request.query(query);
        await disconnect();
        res.status(200).json(result.recordset);
    } catch (e) {
        res.status(500).json({message: e.message});
    }
});

if (process.argv.length > 2) {
    await connect();
    
    let command = process.argv[2];
    let args = process.argv.slice(3);
    
    switch (command) {
        case "+жанр": await addGenre(args); break;
        case "+avtor": await addAuthor(args); break;
        case "+book": await addBook(args); break;
        case "+user": await addUser(args); break;
    
    }
    
    await disconnect();
    process.exit();
}
else {
    app.listen(3000);
}
