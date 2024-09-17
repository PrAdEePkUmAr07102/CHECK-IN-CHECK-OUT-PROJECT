require('dotenv').config();


const express = require ('express');
const pool = require('./db');
const port = 7000;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET;





const app = express();
app.use(express.json());




// 1. Create Users Table (Signup API):

app.post('/users',async(req,res)=>{
    try {
        await pool.query(`
            CREATE TABLE users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100),
                age INT,
                email VARCHAR(100) UNIQUE,
                password VARCHAR(100)
            )
        `);
        res.status(201).send('Users Table Created Successfully');

    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});




// 2. Signup API with Password Hashing;

app.post('/signup', async (req, res) => {

    const { name, age, email, password } = req.body;
    if (!name || !age || !email || !password  ) {
        return res.status(400).send('All details are required');
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO users (name, age, email, password) VALUES ($1, $2, $3, $4)`,
            [name, age, email, passwordHash]
        );

        res.status(201).json({name,age,email});
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});




// 3.LOGIN API WITH ONE - ONE RELATION;

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Check if both email and password are provided
    if (!email || !password) {
        return res.status(400).send('Email and password are required');
    }

    try {
        
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];

        
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Compare the provided password with the hashed password in the database
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(404).send('Password Incorrect'); 
        }


        // Generate JWT with user details

        const token = jwt.sign({
            id: user.id,
            name: user.name,
            email: user.email,
            age: user.age
        }, jwtSecret, { expiresIn: '1h' });

        res.status(200).json({
            message: 'Login successful',token });


    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});




//check-in and check-out status:

const statusEnum = {
    Check_in:'check in',
    Check_out:'check-out'
};


const authenticateToken = (req,res,next)=>{
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if(!token){
        res.sendStatus(404);
    }
    jwt.verify(token,process.env.JWT_SECRET,(err,user)=>{
        if(err){
            res.sendStatus(404);
        }
        req.user = user;
        next();
    })
}


// Create the timelapse table
app.post('/status',authenticateToken,async(req,res)=>{
    try {
        await pool.query(
            `CREATE TABLE statusId(
                 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                 userId UUID  REFERENCES users(id),
                 time TIMESTAMP,
                 status VARCHAR(100) DEFAULT '${statusEnum.Check_out}' 
            )
       `);

       res.status(201).send('Table created successfully');
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});




//check in status;

app.post('/checkin',authenticateToken, async (req, res) => {
    
    console.log(req?.user);

    let userId= req.user.id;

    let existingUser= await pool.query('SELECT * FROM users WHERE id=$1', [userId]);        

    const currentTime = new Date();

    if (!existingUser) {
        return res.status(400).send('User Not found');
    }

    try {
       
        const statusResult = await pool.query(
            'SELECT status FROM statusId WHERE userId=$1 ORDER BY time DESC LIMIT 1',
            [userId]
        );

        let newStatus;

        

        if(!statusResult.rows[0]){
            
                await pool.query(
                    `INSERT INTO statusId (userId, time, status) VALUES($1, $2, $3)`,
                    [userId, currentTime, statusEnum.Check_in]
                );
                res.status(201).send('Check-in Successful');
            
        }else   if (statusResult.rows[0].status === statusEnum.Check_out) {

            newStatus = statusEnum.Check_in;
            await pool.query(
                `INSERT INTO statusId (userId, time, status) VALUES($1, $2, $3)`,
                [userId, currentTime, newStatus]
            );

            res.status(201).send('Check-in Successful');

        } else if (statusResult.rows[0].status === statusEnum.Check_in) {
          
            newStatus = statusEnum.Check_out; 
            await pool.query(
                `INSERT INTO statusId (userId, time, status) VALUES($1, $2, $3)`,
                [userId, currentTime, newStatus]
            );
            res.status(201).send('Check-out Successful');
        }
      
       
    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
});



app.listen(port,()=>console.log(`The Server is Running On Port:${port}`));









