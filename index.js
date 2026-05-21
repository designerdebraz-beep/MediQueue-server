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

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  console.log("Auth Header:", authHeader);
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log("Token Payload:", payload);
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

async function run() {
  try {
    const db = client.db('MediQueue');
    // আপনার প্রধান কালেকশন 'course'
    const coursecollection = db.collection('course');
    const bookingsCollection = db.collection('bookings');

    // -------------------------------------------------------------------------
    // TUTORS ROUTES (Collection: course)
    // -------------------------------------------------------------------------

    // ১. GET Featured Tutors (স্ট্যাটিক রাউটটি ডাইনামিক আইডির উপরে রাখা হয়েছে)
    app.get('/featured', async (req, res) => {
      try {
        const cursor = coursecollection.find().limit(6);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch featured tutors", error: error.message });
      }
    });

    // ২. GET My Tutors (যেখানে isMyTutor: true)
    app.get('/my-tutors', async (req, res) => {
      try {
        const query = { isMyTutor: true }; 
        const result = await coursecollection.find(query).sort({ createdAt: -1 }).toArray();
        res.status(200).json(result);
      } catch (error) {
        console.error("Fetch my-tutors error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch your tutors" });
      }
    });

    // ৩. GET All Tutors (with Search and Date Filter)
    app.get('/tutors', async (req, res) => {
      try {
        const { search, startDate, endDate } = req.query;
        let query = {};

        // Search by name
        if (search && search.trim() !== "" && search !== "undefined") {
          query.name = { $regex: search, $options: 'i' };
        }

        // Date Filter
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
        console.error("Fetch tutors error:", error);
        res.status(500).send({ message: "Failed to fetch tutors", error: error.message });
      }
    });

    // ৪. GET Single Tutor Details (by ID - Protected Route)
    app.get('/tutors/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      console.log("Backend received ID to fetch:", id);
      
      try {
        let result = await coursecollection.findOne({ _id: id });

        if (!result && ObjectId.isValid(id)) {
          result = await coursecollection.findOne({ _id: new ObjectId(id) });
        }
        
        if (!result) {
          console.log(`❌ Tutor with ID ${id} NOT found in 'course' collection.`);
          return res.status(404).send({ message: "Tutor not found in database" });
        }
        
        console.log("✅ Tutor Data Found Successfully:", result.name);
        res.send(result);
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).send({ message: "Error fetching tutor details", error: error.message });
      }
    });

    // ৫. POST Add New Tutor
    app.post('/tutors', async (req, res) => {
      try {
        const tutorData = req.body;

        const newTutor = {
          ...tutorData,
          hourlyFee: parseFloat(tutorData.hourlyFee) || 0,
          totalSlot: parseInt(tutorData.totalSlot, 10) || 0,
          remainingSlots: parseInt(tutorData.totalSlot, 10) || 0,
          isMyTutor: true,
          createdAt: new Date()
        };

        if (tutorData._id && ObjectId.isValid(tutorData._id)) {
          newTutor._id = new ObjectId(tutorData._id);
        } else if (tutorData._id) {
          newTutor._id = tutorData._id; 
        }

        const result = await coursecollection.insertOne(newTutor);
        res.status(201).json({ success: true, message: "Tutor added successfully!", tutorId: result.insertedId });
      } catch (error) {
        console.error("Post Error:", error);
        res.status(500).json({ success: false, message: "Failed to add tutor" });
      }
    });

    // ৬. PUT Update Tutor
    app.put('/tutors/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        
        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            name: updatedData.name,
            image: updatedData.image || updatedData.photoUrl, 
            subject: updatedData.subject,
            available: updatedData.available,
            hourlyFee: parseFloat(updatedData.hourlyFee) || 0,
            totalSlot: parseInt(updatedData.totalSlot, 10) || 0,
            remainingSlots: parseInt(updatedData.totalSlot, 10) || 0, 
            institution: updatedData.institution,
            location: updatedData.location,
            mode: updatedData.mode || updatedData.teachingMode,
            experience: updatedData.experience,
          }
        };

        const result = await coursecollection.updateOne(query, updateDoc);

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

    // ৭. DELETE Tutor
    app.delete('/tutors/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        
        const result = await coursecollection.deleteOne(query);
        
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


    // -------------------------------------------------------------------------
    // BOOKINGS ROUTES (Collection: bookings)
    // -------------------------------------------------------------------------

    // ৮. GET All Bookings
    app.get('/bookings', async (req, res) => {
      try {
        const cursor = bookingsCollection.find({});
        await cursor.sort({ bookedAt: -1 });
        const result = await cursor.toArray();
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

    // ৯. POST Create Booking (and Decrease Tutor Remaining Slot)
    app.post('/bookings', async (req, res) => {
      const bookingData = req.body; 
      const { tutorId } = bookingData;

      try {
        const insertResult = await bookingsCollection.insertOne({
          ...bookingData,
          status: "Confirmed", 
          bookedAt: new Date() 
        });

        // হ্যান্ডেল অবজেক্ট আইডি বা স্ট্রিং আইডি ম্যাচিং সেফটি
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

    // ১০. PATCH Cancel Booking
    app.patch('/bookings/:id/cancel', async (req, res) => {
      const { id } = req.params;
      let query;
      try {
        query = { _id: new ObjectId(id) };
      } catch (err) {
        query = { _id: id };
      }

      try {
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

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB Connection/Run Error:", error);
  }
}

// MongoDB চালানো শুরু করা
run().catch(console.dir);

// Root Route
app.get('/', (req, res) => {
  res.send('Hello World! MediQueue Server is Running.');
});

// App Listener
app.listen(port, () => {
  console.log(`MediQueue app listening on port ${port}`);
});