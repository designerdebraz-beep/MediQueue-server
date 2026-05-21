const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const app = express();
const port = process.env.PORT || 8080;
const dotenv = require("dotenv");
dotenv.config();
const cors = require('cors');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

// Middleware
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_DB_URI;

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log(payload);
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

async function run() {
  try {
    // Connect the client to the server
    // await client.connect();

    const db = client.db('MediQueue');
    const coursecollection = db.collection('course');


    // app.get('/tutors', logger, async (req, res) => {
    //   try {
    //     const cursor = coursecollection.find();
    //     const result = await cursor.toArray();
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send({ message: "Failed to fetch tutors", error: error.message });
    //   }
    // });


 app.get('/featured', async (req, res) => {
      try {
        const cursor = coursecollection.find().limit(6);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch featured tutors", error: error.message });
      }
    });

app.get('/tutors',  async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;
    let query = {};

  // add search function on the backend
    if (search && search.trim() !== "" && search !== "undefined") {
      query.name = { $regex: search, $options: 'i' };
    }

    if ((startDate && startDate !== "undefined") || (endDate && endDate !== "undefined")) {
      query.createdAt = {};
      if (startDate && startDate !== "undefined") {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate && endDate !== "undefined") {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

   
    const result = await coursecollection.find(query).toArray();
    
    res.send(result);
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).send({ message: "Failed to fetch tutors", error: error.message });
  }
});

 app.get('/tutors/:id',  async (req, res) => {
      const { id } = req.params;
      
      try {
        
        const query = {
          $or: [
            { _id: id },
            ...(ObjectId.isValid(id) ? [{ _id: new ObjectId(id) }] : [])
          ]
        };

        const result = await coursecollection.findOne(query);
        
        if (!result) {
          return res.status(404).send({ message: "Tutor not found in database" });
        }
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching tutor details", error: error.message });
      }
    });
   
   


  
  
app.delete('/tutors/:id',  async (req, res) => {
  try {
    const id = req.params.id;
    
    
    const courseCollection = client.db('MediQueue').collection('tutors');
    
   
    const query = { _id: new ObjectId(id) };
    
    
    const result = await courseCollection.deleteOne(query);
    
    if (result.deletedCount === 1) {
      res.status(200).send({ success: true, message: "Tutor deleted successfully" });
    } else {
      res.status(404).send({ success: false, message: "Tutor not found" });
    }
  } catch (error) {
    console.error("Backend Delete Error:", error);
    res.status(500).send({ success: false, message: "Internal Server Error", error: error.message });
  }
});

app.put('/tutors/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    
    const courseCollection = client.db('MediQueue').collection('tutors');
    const query = { _id: new ObjectId(id) };

    // আপডেট করার জন্য নতুন অবজেক্ট তৈরি এবং টাইপ কাস্টিং সেফটি নিশ্চিত করা
    const updateDoc = {
      $set: {
        name: updatedData.name,
        image: updatedData.image || updatedData.photoUrl, // ফ্রন্টএন্ডের ফিল্ডের সাথে ম্যাচিং
        subject: updatedData.subject,
        available: updatedData.available,
        hourlyFee: parseFloat(updatedData.hourlyFee),
        totalSlot: parseInt(updatedData.totalSlot, 10),
        remainingSlots: parseInt(updatedData.totalSlot, 10), // স্লট বাড়ালে রিমেইনিং স্লটও রিসেট হবে
        institution: updatedData.institution,
        location: updatedData.location,
        mode: updatedData.mode || updatedData.teachingMode,
        experience: updatedData.experience,
      }
    };

    const result = await courseCollection.updateOne(query, updateDoc);

    if (result.matchedCount === 1) {
      res.status(200).send({ success: true, message: "Tutor updated successfully" });
    } else {
      res.status(404).send({ success: false, message: "Tutor not found" });
    }
  } catch (error) {
    console.error("Backend Update Error:", error);
    res.status(500).send({ success: false, message: "Internal Server Error", error: error.message });
  }
});


    app.post('/tutors', async (req, res) => {
      try {
        const tutorData = req.body;
        const courseCollection = client.db('MediQueue').collection('tutors');

        const newTutor = {
          ...tutorData,
          hourlyFee: parseFloat(tutorData.hourlyFee),
          totalSlot: parseInt(tutorData.totalSlot, 10),
          remainingSlots: parseInt(tutorData.totalSlot, 10),
          isMyTutor: true, // 👈 এই ফ্ল্যাগটি শুধুমাত্র আপনার ইনসার্ট করা ডেটা চিনতে সাহায্য করবে
          createdAt: new Date()
        };

        const result = await courseCollection.insertOne(newTutor);
        res.status(201).json({ success: true, message: "Tutor added successfully!" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to add tutor" });
      }
    });

   
    app.get('/my-tutors', async (req, res) => {
      try {
        const courseCollection = client.db('MediQueue').collection('tutors');
        
        // 👈 শুধুমাত্র যেখানে isMyTutor: true আছে, সেই ডেটাগুলোই ফিল্টার হবে
        const query = { isMyTutor: true }; 
        
        const result = await courseCollection.find(query).sort({ createdAt: -1 }).toArray();
        res.status(200).json(result);
      } catch (error) {
        console.error("Fetch error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch your tutors" });
      }
    });



    app.get('/bookings', async (req, res) => {
      try {
        // নিশ্চিত করুন db এবং কালেকশন দুটোই সঠিকভাবে সিলেক্টেড আছে
        const bookingsCollection = client.db('MediQueue').collection('bookings');
        
        // কুয়েরি অপ্টিমাইজেশন এবং তোলপাড় এড়াতে সর্টিং লজিক ফিক্স
        const cursor = bookingsCollection.find({});
        
        // লেটেস্ট বুকিং আগে দেখানোর জন্য সর্ট করা
        await cursor.sort({ bookedAt: -1 });
        
        const result = await cursor.toArray();
        
        // ডেটা যদি খালিও থাকে, ক্র্যাশ না করে খালি অ্যারে [] পাঠাবে
        res.status(200).json(result);
      } catch (error) {
        console.error("CRITICAL BACKEND ERROR FOR /bookings:", error);
        res.status(500).json({ 
          success: false, 
          message: "Failed to fetch bookings due to backend crash", 
          error: error.message 
        });
      }
    });

   
    app.post('/bookings', async (req, res) => {
      const bookingData = req.body; 
      const { tutorId } = bookingData;

      try {
        const bookingsCollection = db.collection('bookings');

        // নতুন বুকিংয়ের সাথে status: "Confirmed" যোগ করে ইনসার্ট করা হচ্ছে
        const insertResult = await bookingsCollection.insertOne({
          ...bookingData,
          status: "Confirmed", 
          bookedAt: new Date() 
        });

        // স্লট ১ কমানোর লজিক
        const query = {
          $or: [
            { _id: tutorId },
            ...(ObjectId.isValid(tutorId) ? [{ _id: new ObjectId(tutorId) }] : [])
          ]
        };

        const tutor = await coursecollection.findOne(query);
        if (tutor) {
          const currentSlots = parseInt(tutor.remainingSlots, 10);
          if (!isNaN(currentSlots) && currentSlots > 0) {
            await coursecollection.findOneAndUpdate(
              query,
              { $set: { remainingSlots: currentSlots - 1 } }
            );
          }
        }

        res.status(201).json({ success: true, bookingId: insertResult.insertedId });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

   
    app.post('/tutors', async (req, res) => {
      try {
        const tutorData = req.body;
        
        // নিশ্চিত করুন db এবং সঠিক কালেকশন সিলেক্টেড আছে
        const courseCollection = client.db('MediQueue').collection('tutors'); // আপনার কালেকশনের নাম অনুযায়ী পরিবর্তন করতে পারেন

        // নতুন টিউটর যোগ করার সময় তার remainingSlots হবে তার totalSlot-এর সমান
        const newTutor = {
          ...tutorData,
          hourlyFee: parseFloat(tutorData.hourlyFee), // সংখ্যায় কনভার্ট করা
          totalSlot: parseInt(tutorData.totalSlot, 10), // সংখ্যায় কনভার্ট করা
          remainingSlots: parseInt(tutorData.totalSlot, 10), // শুরুতে রিমেইনিং স্লট টোটালের সমান হবে
          createdAt: new Date() // কখন যুক্ত করা হলো তা ট্র্যাকিংয়ের জন্য
        };

        const result = await courseCollection.insertOne(newTutor);

        res.status(201).json({
          success: true,
          message: "Tutor added successfully!",
          tutorId: result.insertedId
        });
      } catch (error) {
        console.error("Add tutor backend error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to add tutor",
          error: error.message
        });
      }
    });

    app.patch('/bookings/:id/cancel', async (req, res) => {
      const { id } = req.params;

      let query;
      try {
        query = { _id: new ObjectId(id) };
      } catch (err) {
        query = { _id: id };
      }

      try {
        const bookingsCollection = db.collection('bookings');
        
        // ডাটাবেজে স্ট্যাটাস পরিবর্তন করে "cancelled" করা হচ্ছে
        const result = await bookingsCollection.findOneAndUpdate(
          query,
          { $set: { status: "cancelled" } },
          { returnDocument: 'after' }
        );

        if (!result) {
          return res.status(404).json({ success: false, message: "Booking not found" });
        }

        res.status(200).json({ success: true, message: "Status updated to cancelled", data: result });
      } catch (error) {
        console.error("Cancel booking error:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
      }
    });
   
   



    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB Connection/Run Error:", error);
  }
}


run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World! MediQueue Server is Running.');
});


app.listen(port, () => {
  console.log(`MediQueue app listening on port ${port}`);
});


