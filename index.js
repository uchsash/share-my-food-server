require('dotenv').config();
const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;


//Middleware cors and express
app.use(cors());
app.use(express.json());

// Firebase for Verification
const serviceAccount = require("./food-share-firebase-key.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


//Mongodb URI
const uri = `mongodb+srv://${process.env.FOOD_ADMIN}:${process.env.FOOD_PASS}@web0.qwomfie.mongodb.net/?retryWrites=true&w=majority&appName=Web0`;

//Mongodb Client
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const db = client.db('foodDB');
        const usersCollection = db.collection('users');
        const foodCollection = db.collection('foods');

        //Custom Middleware: Firebase
        const verifyFirebaseToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;

            if (!authHeader?.startsWith("Bearer ")) {
                return res.status(401).json({ message: "Unauthorized: No token provided" });
            }

            const token = authHeader.split(" ")[1];

            try {
                const decoded = await admin.auth().verifyIdToken(token);
                req.user = decoded;
                next();
            } catch (error) {
                console.error("Token verification failed:", error);
                return res.status(403).json({ message: "Forbidden: Invalid token" });
            }
        };


        // Food Relate APIs
        app.get('/foods', async (req, res) => {
            try {
                const { status, sort } = req.query;

                const query = {};
                if (status) query.status = status;

                const sortOption = {};
                if (sort === 'asc') {
                    sortOption.expiredAt = 1;
                } else if (sort === 'desc') {
                    sortOption.expiredAt = -1;
                }

                const foods = await foodCollection
                    .find(query)
                    .sort(sortOption)
                    .toArray();

                res.json(foods);
            } catch (error) {
                console.error('Error fetching foods:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        app.get('/foods/my-added-foods', verifyFirebaseToken, async (req, res) => {
            const { email } = req.query;

            if (email !== req.user.email) {
                return res.status(403).json({ message: "Forbidden: Email mismatch" });
            }

            try {
                const foods = await foodCollection.find({ donorEmail: email }).toArray();
                res.json(foods);
            } catch (error) {
                console.error("Error fetching user's foods:", error);
                res.status(500).json({ message: "Internal server error" });
            }
        });

        app.get('/foods/my-requests', verifyFirebaseToken, async (req, res) => {
            const { email } = req.query;

            if (email !== req.user.email) {
                return res.status(403).json({ message: "Forbidden: Email mismatch" });
            }

            try {
                const foods = await foodCollection
                    .find({ requestedBy: email })
                    .toArray();

                res.json(foods);
            } catch (error) {
                console.error("Error fetching requested foods:", error);
                res.status(500).json({ message: "Internal server error" });
            }
        });


        app.get('/foods/:id', async (req, res) => {
            const { id } = req.params;

            try {
                const food = await foodCollection.findOne({ _id: new ObjectId(id) });

                if (!food) {
                    return res.status(404).json({ message: 'Food not found' });
                }

                res.json(food);
            } catch (error) {
                console.error('Error fetching food:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });


        app.post('/foods', verifyFirebaseToken, async (req, res) => {
            const food = req.body;

            try {
                food.status = food.status || 'available';

                const result = await foodCollection.insertOne(food);
                res.status(201).json({
                    message: 'Food item added successfully',
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error('Error adding food:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        app.patch('/foods/:id', verifyFirebaseToken, async (req, res) => {
            const { id } = req.params;
            const updateDoc = req.body;

            try {
                const result = await foodCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateDoc }
                );
                res.json(result);
            } catch (error) {
                console.error("Error updating food:", error);
                res.status(500).json({ message: "Internal server error" });
            }
        });



        app.patch('/foods/request/:id', verifyFirebaseToken, async (req, res) => {
            const { id } = req.params;
            const { requestedNote, requestDate, requestedBy } = req.body;

            try {
                const result = await foodCollection.updateOne(
                    { _id: new ObjectId(id), status: 'available' },
                    {
                        $set: {
                            status: 'requested',
                            requestedNote,
                            requestDate: new Date(requestDate),
                            requestedBy,
                        },
                    }
                );

                if (result.modifiedCount === 0) {
                    return res.status(400).json({ message: 'Request failed or food already requested' });
                }

                res.json({ message: 'Food request successful', modifiedCount: result.modifiedCount });
            } catch (error) {
                console.error('Error updating food request:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        app.delete('/foods/:id', verifyFirebaseToken, async (req, res) => {
            const { id } = req.params;

            try {
                const result = await foodCollection.deleteOne({ _id: new ObjectId(id) });
                res.json(result);
            } catch (error) {
                console.error("Error deleting food:", error);
                res.status(500).json({ message: "Internal server error" });
            }
        });



        // User Related APIs
        app.get('/users', verifyFirebaseToken, async (req, res) => {
            const { email } = req.query;

            try {
                if (email) {
                    const user = await usersCollection.findOne({ email });
                    if (!user) {
                        return res.status(404).json({ message: 'User not found' });
                    }
                    return res.json(user);
                }

                const allUsers = await usersCollection.find().toArray();
                return res.json(allUsers);
            } catch (error) {
                console.error('Error fetching users:', error);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        });

        app.get('/users/profile/:email', verifyFirebaseToken, async (req, res) => {
            const email = req.params.email;

            if (req.user.email !== email) {
                return res.status(403).json({ message: 'Forbidden: You can only access your own profile' });
            }

            try {
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }
                res.json(user);
            } catch (error) {
                console.error('Failed to fetch user profile:', error);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        });

        app.post('/users', async (req, res) => {
            const userProfile = req.body;

            try {
                const existingUser = await usersCollection.findOne({ email: userProfile.email });

                if (existingUser) {
                    return res.status(200).json({ message: 'User already exists', userProfile: existingUser });
                }

                const result = await usersCollection.insertOne(userProfile);
                res.status(201).json({ message: 'User registered successfully', userId: result.insertedId });
            } catch (error) {
                console.error('Error creating user:', error);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        });



        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

//API
app.get('/', (req, res) => {
    res.send("FoodShare Server is running hot.")
});

app.listen(port, () => {
    console.log(`FoodShare Server is running on port ${port}`)
})
