const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const Room = require("../models/Room");

/* =====================
   HELPERS
===================== */

const isRoomAdmin = (room, userId) => {
  return room.admin.userId === userId;
};

const getParticipant = (room, userId) => {
  return room.participants.find(
    (p) => p.userId === userId
  );
};

const findRoom = (roomId) => {
  return Room.findOne({
    roomId: String(roomId).toUpperCase(),
  });
};

const generateRoomId = async () => {
  while (true) {
    const candidate =
      "BR" +
      Math.floor(1000 + Math.random() * 9000);

    const existing = await Room.findOne({
      roomId: candidate,
    });

    if (!existing) return candidate;
  }
};

/* =====================
   MAIN WEBSITE ADMIN
   (Controls everything)
===================== */

router.get("/admin/all", adminAuth, async (req, res) => {
  try {
    const rooms = await Room.find().sort({
      createdAt: -1,
    });

    res.json(rooms);
  } catch (error) {
    res.status(500).json(error);
  }
});

router.post("/admin/:roomId/end", adminAuth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    room.status = "ended";

    await room.save();

    res.json({
      message: "Room Force Ended",
      room,
    });
  } catch (error) {
    res.status(500).json(error);
  }
});

router.delete("/admin/:roomId", adminAuth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    await room.deleteOne();

    res.json({ message: "Room Deleted" });
  } catch (error) {
    res.status(500).json(error);
  }
});

/* =====================
   ROOM CREATOR
   (Admin of that room only)
===================== */

// Create Room -> creator becomes Room Admin

router.post("/", auth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ message: "Room Name Required" });
    }

    const roomId = await generateRoomId();

    const room = new Room({
      name,
      roomId,
      admin: {
        userId: req.user.id,
        name: req.body.adminName || "Admin",
      },
      participants: [
        {
          userId: req.user.id,
          name: req.body.adminName || "Admin",
        },
      ],
    });

    await room.save();

    res.status(201).json({
      message: "Room Created",
      room,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Error Creating Room",
    });
  }
});

// Update Room Settings (Room Admin only, before the quiz starts)

router.put("/:roomId/settings", auth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    if (!isRoomAdmin(room, req.user.id)) {
      return res
        .status(403)
        .json({ message: "Room Admin Only" });
    }

    if (room.status !== "waiting") {
      return res.status(400).json({
        message:
          "Settings can only be changed before the quiz starts",
      });
    }

    const {
      questionTimer,
      certificateThreshold,
      allowReview,
      strictMode,
    } = req.body;

    if (questionTimer !== undefined) {
      if (
        typeof questionTimer !== "number" ||
        questionTimer < 5 ||
        questionTimer > 300
      ) {
        return res.status(400).json({
          message:
            "Timer must be between 5 and 300 seconds",
        });
      }

      room.settings.questionTimer = questionTimer;
    }

    if (certificateThreshold !== undefined) {
      if (
        typeof certificateThreshold !== "number" ||
        certificateThreshold < 10 ||
        certificateThreshold > 100
      ) {
        return res.status(400).json({
          message:
            "Certificate threshold must be between 10 and 100",
        });
      }

      room.settings.certificateThreshold =
        certificateThreshold;
    }

    if (allowReview !== undefined) {
      room.settings.allowReview = !!allowReview;
    }

    if (strictMode !== undefined) {
      room.settings.strictMode = !!strictMode;
    }

    await room.save();

    res.json({
      message: "Settings Updated",
      settings: room.settings,
    });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Start Quiz (Room Admin only)

router.post("/:roomId/start", auth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    if (!isRoomAdmin(room, req.user.id)) {
      return res
        .status(403)
        .json({ message: "Room Admin Only" });
    }

    if (room.status !== "waiting") {
      return res
        .status(400)
        .json({ message: "Quiz Already Started" });
    }

    if (room.questions.length === 0) {
      return res.status(400).json({
        message:
          "Add at least one question before starting",
      });
    }

    room.status = "active";

    await room.save();

    res.json({ message: "Quiz Started", room });
  } catch (error) {
    res.status(500).json(error);
  }
});

// End Quiz (Room Admin only)

router.post("/:roomId/end", auth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    if (!isRoomAdmin(room, req.user.id)) {
      return res
        .status(403)
        .json({ message: "Room Admin Only" });
    }

    room.status = "ended";

    await room.save();

    res.json({ message: "Quiz Ended", room });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Remove Participant (Room Admin only)

router.delete(
  "/:roomId/participants/:userId",
  auth,
  async (req, res) => {
    try {
      const room = await findRoom(
        req.params.roomId
      );

      if (!room) {
        return res.status(404).json({
          message: "Room Not Found",
        });
      }

      if (!isRoomAdmin(room, req.user.id)) {
        return res
          .status(403)
          .json({ message: "Room Admin Only" });
      }

      const participant = getParticipant(
        room,
        req.params.userId
      );

      if (!participant) {
        return res.status(404).json({
          message: "Participant Not Found",
        });
      }

      if (
        participant.userId === room.admin.userId
      ) {
        return res.status(400).json({
          message: "Cannot Remove Room Admin",
        });
      }

      participant.removed = true;

      await room.save();

      res.json({
        message: "Participant Removed",
      });
    } catch (error) {
      res.status(500).json(error);
    }
  }
);

// Add Room-specific Question (Room Admin only)

router.post(
  "/:roomId/questions",
  auth,
  async (req, res) => {
    try {
      const room = await findRoom(
        req.params.roomId
      );

      if (!room) {
        return res.status(404).json({
          message: "Room Not Found",
        });
      }

      if (!isRoomAdmin(room, req.user.id)) {
        return res
          .status(403)
          .json({ message: "Room Admin Only" });
      }

      if (room.status !== "waiting") {
        return res.status(400).json({
          message:
            "Questions can only be added before the quiz starts",
        });
      }

      const { question, options, answer } =
        req.body;

      if (
        !question ||
        !options ||
        options.length < 2 ||
        !answer
      ) {
        return res.status(400).json({
          message:
            "Question, options and answer required",
        });
      }

      room.questions.push({
        question,
        options,
        answer,
      });

      await room.save();

      res.status(201).json({
        message: "Question Added",
        room,
      });
    } catch (error) {
      res.status(500).json(error);
    }
  }
);

// Delete Room Question (Room Admin only)

router.delete(
  "/:roomId/questions/:questionId",
  auth,
  async (req, res) => {
    try {
      const room = await findRoom(
        req.params.roomId
      );

      if (!room) {
        return res.status(404).json({
          message: "Room Not Found",
        });
      }

      if (!isRoomAdmin(room, req.user.id)) {
        return res
          .status(403)
          .json({ message: "Room Admin Only" });
      }

      if (room.status !== "waiting") {
        return res.status(400).json({
          message:
            "Questions can only be removed before the quiz starts",
        });
      }

      room.questions = room.questions.filter(
        (q) =>
          q._id.toString() !==
          req.params.questionId
      );

      await room.save();

      res.json({ message: "Question Deleted" });
    } catch (error) {
      res.status(500).json(error);
    }
  }
);

/* =====================
   PARTICIPANTS
===================== */

// Join Room using Room ID (e.g. BR1234)

router.post("/join", auth, async (req, res) => {
  try {
    const { roomId } = req.body;

    const room = await findRoom(roomId);

    if (!room) {
      return res
        .status(404)
        .json({ message: "Invalid Room ID" });
    }

    if (room.status === "ended") {
      return res
        .status(400)
        .json({ message: "Room Already Ended" });
    }

    const userId = req.user.id;

    const existing = getParticipant(
      room,
      userId
    );

    if (existing && existing.removed) {
      return res.status(403).json({
        message:
          "You were removed from this room",
      });
    }

    if (!existing) {
      room.participants.push({
        userId,
        name: req.body.name || "Player",
      });

      await room.save();
    }

    res.json({ message: "Joined Room", room });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Leave Room

router.post("/:roomId/leave", auth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    if (isRoomAdmin(room, req.user.id)) {
      return res.status(400).json({
        message:
          "Room Admin cannot leave. End or delete the room instead",
      });
    }

    room.participants = room.participants.filter(
      (p) => p.userId !== req.user.id
    );

    await room.save();

    res.json({ message: "Left Room" });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Submit Quiz Score

router.post("/:roomId/submit", auth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    if (room.status !== "active") {
      return res
        .status(400)
        .json({ message: "Quiz Not Active" });
    }

    const participant = getParticipant(
      room,
      req.user.id
    );

    if (!participant) {
      return res
        .status(403)
        .json({ message: "Not a Participant" });
    }

    if (participant.submitted) {
      return res
        .status(400)
        .json({ message: "Already Submitted" });
    }

    participant.score = req.body.score || 0;
    participant.total =
      req.body.total || room.questions.length;

    if (Array.isArray(req.body.answers)) {
      participant.answers = req.body.answers;
    }

    participant.submitted = true;

    await room.save();

    res.json({ message: "Score Submitted" });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Room Leaderboard

router.get(
  "/:roomId/leaderboard",
  auth,
  async (req, res) => {
    try {
      const room = await findRoom(
        req.params.roomId
      );

      if (!room) {
        return res
          .status(404)
          .json({ message: "Room Not Found" });
      }

      const leaderboard = room.participants
        .filter(
          (p) => p.submitted && !p.removed
        )
        .sort(
          (a, b) => b.score - a.score
        );

      res.json(leaderboard);
    } catch (error) {
      res.status(500).json(error);
    }
  }
);

/* =====================
   CHAT
===================== */

// Get Chat Messages (?after=N for polling)

router.get("/:roomId/chat", auth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    const after = parseInt(req.query.after) || 0;

    res.json(room.chat.slice(after));
  } catch (error) {
    res.status(500).json(error);
  }
});

// Send Chat Message

router.post("/:roomId/chat", auth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    const participant = getParticipant(
      room,
      req.user.id
    );

    const isAdmin = isRoomAdmin(
      room,
      req.user.id
    );

    if (!participant && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not a Participant" });
    }

    if (participant && participant.removed) {
      return res
        .status(403)
        .json({ message: "You were removed" });
    }

    const { message } = req.body;

    if (!message || !message.trim()) {
      return res
        .status(400)
        .json({ message: "Message Required" });
    }

    const name = isAdmin
      ? room.admin.name
      : participant.name;

    room.chat.push({
      userId: req.user.id,
      name,
      message: message.trim().slice(0, 300),
    });

    if (room.chat.length > 200) {
      room.chat = room.chat.slice(-200);
    }

    await room.save();

    // Return the saved message so the sender can
    // render it immediately instead of waiting
    // for the next poll.

    res.status(201).json({
      message: "Message Sent",
      chatMessage: room.chat[room.chat.length - 1],
    });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Rooms I Administer

router.get("/mine", auth, async (req, res) => {
  try {
    const rooms = await Room.find({
      "admin.userId": req.user.id,
    }).sort({ createdAt: -1 });

    res.json(rooms);
  } catch (error) {
    res.status(500).json(error);
  }
});

// Rooms I Joined

router.get("/joined", auth, async (req, res) => {
  try {
    const rooms = await Room.find({
      participants: {
        $elemMatch: {
          userId: req.user.id,
          removed: false,
        },
      },
    }).sort({ createdAt: -1 });

    res.json(rooms);
  } catch (error) {
    res.status(500).json(error);
  }
});

/* =====================
   ROOM DETAILS
   (must be after /mine, /joined and /admin/all)
===================== */

router.get("/:roomId", auth, async (req, res) => {
  try {
    const room = await findRoom(
      req.params.roomId
    );

    if (!room) {
      return res
        .status(404)
        .json({ message: "Room Not Found" });
    }

    const userId = req.user.id;

    const allowed =
      isRoomAdmin(room, userId) ||
      !!getParticipant(room, userId);

    if (!allowed) {
      return res
        .status(403)
        .json({ message: "Join the room first" });
    }

    res.json(room);
  } catch (error) {
    res.status(500).json(error);
  }
});

module.exports = router;
