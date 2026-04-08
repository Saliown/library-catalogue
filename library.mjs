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
        request.input("name", sql.VarChar, args[0])`

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

async function addAuthor(authorName) {
    let query = `insert into AUTHORS(NAME_A)
        output inserted.id
        values(@name)`;

    try {
        const request = new sql.Request();
        const result = await request
            .input("name", sql.VarChar, authorName)
            .query(query);
        
        return result.recordset[0].id;
    } catch (e) {
        console.log("Ошибка:", e.message);
    }
}

async function addOrFindAuthor(authorName) {
    let id = await findAuthor(authorName);

    if (id == null)
        id = await addAuthor(authorName);

    return id;
}


async function findAuthor(name) {
    let query = `
        select id from AUTHORS
        where name_a = @name;
    `;

    try {
        const request = new sql.Request();
        const result = await request.input("name", name).query(query);
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
    await connect();
    app.listen(3000, () => console.log("ЖДУ"));
}

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    let query = `
        SELECT * FROM USERS
        WHERE EMAIL = @Email AND PASSWORD = @Password
    `;

    const request = new sql.Request();
    request.input("Email", sql.VarChar, email);
    request.input("Password", sql.VarChar, password);

    const result = await request.query(query);

    if (result.recordset.length === 0) {
        return res.status(401).json({ message: "Неверные данные" });
    }

    res.json(result.recordset[0]);
});

// ищем книжки по ISBN
app.post("/query-isbn", async (req, res) => {
    const request = new sql.Request();
    let query = 
    `select name_a, title, year, total from
        books inner join authors on books.AUTHOR_ID = authors.id
            left join amounts on amounts.isbn = books.isbn
    where books.isbn = @isbn
    `;

    const result = await request.input("isbn", req.body.isbn).query(query);

    // такие книжки уже есть
    if (result.recordset.length > 0) {
        res.status(200).json(result.recordset[0]);
    }
    else {
        res.status(404).send();
    }
});


// внесем новые книжки в базу за один заход
app.post("/add-books", async(req,res) => {
    // сначала ищем такие книжки по ISBN

    let authorId = await addOrFindAuthor(req.body.author);

    let request = new sql.Request();
    let query = `insert into books(isbn, author_id, title, year)
        output inserted.isbn
        values(@isbn, @author_id, @title, @year)`;
    
    let result = await request
            .input("isbn", req.body.isbn)
            .input("author_id", authorId)
            .input("title", req.body.title)
            .input("year", req.body.year)
            .query(query);
    
    let isbn = result.recordset[0].isbn;

    request = new sql.Request();
    query = `insert into amounts (isbn, total) output inserted.total values (@isbn, @total)`;
    result = await request
        .input("isbn", isbn)
        .input("total", req.body.amount)
        .query(query);
    
    let total = result.recordset[0].total;

    res.status(200).json({isbn, total});

});

app.post("/search", async (req, res) => {
    let query = `
        select isbn, name_a, title
        from books inner join authors on books.author_id = authors.id
        where name_a like @author and title like @title
    `;

    let request = new sql.Request();
    let result = await request
        .input("author", req.body.author)
        .input("title", req.body.title)
        .query(query);
    
    res.status(200).json(result.recordset);
});
