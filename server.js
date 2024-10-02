require('dotenv').config();


const express = require ('express');
const pool = require('./db');
const port = 3000;
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
        }, jwtSecret);

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


app.post('/checkin', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const clientTime = new Date(); // Using the client's PC time


    try {
        const statusResult = await pool.query(
            'SELECT time, status FROM statusId WHERE userId=$1 ORDER BY time DESC LIMIT 1',
            [userId]
        );

        let lastStatus;
   

        if (statusResult.rows.length > 0) {
            lastStatus = statusResult.rows[0].status;
        }

       
        if (!lastStatus) {
            await pool.query(
                'INSERT INTO statusId (userId, time, status) VALUES($1, $2, $3)',
                [userId, clientTime, statusEnum.Check_in]
            );
            return res.status(201).send('Check-in Successful');
        }

        
        if (lastStatus === statusEnum.Check_in) {
            await pool.query(
                'INSERT INTO statusId (userId, time, status) VALUES($1, $2, $3)',
                [userId, clientTime, statusEnum.Check_out]
            );
            return res.status(201).send('Check-out Successful');
        }
    
        // If the user has checked in within the last 24 hours, block it

        if(lastStatus === statusEnum.Check_out ){
                
       
            
                const t2 = new Date();
                t2.setHours(0, 0, 0, 0); // 00:00 today

                const t4 = new Date();
                t4.setHours(23, 59, 59, 999); // 23:59:59 today

        const checkinResult = await pool.query(
            `SELECT * FROM statusId  WHERE userId = $1 AND time BETWEEN $2 AND $3 AND status = $4`,
            [userId, t2, t4, statusEnum.Check_in])

        if (checkinResult.rows.length>0) {
            return res.status(400).send('You have already checked in within the last 24 hours.');
        }else{
            await pool.query(
                `INSERT INTO statusId (userId, time, status) VALUES($1, $2, $3)`,
                [userId, clientTime, statusEnum.Check_in]);
    
                return res.status(201).send('Check in successfully');}
            
        
        }; 
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
});
app.listen(port, () => console.log(`The Server is Running On Port: ${port}`));







    