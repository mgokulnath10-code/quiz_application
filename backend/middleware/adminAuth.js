const jwt = require("jsonwebtoken");

const adminAuth = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({
      message: "Access Denied",
    });
  }

  try {
    const decoded = jwt.verify(
      token.replace(/^Bearer\s+/i, ""),
      process.env.JWT_SECRET
    );

    if (decoded.role !== "admin") {
      return res.status(403).json({
        message: "Admin Access Only",
      });
    }

    req.admin = decoded;

    next();
  } catch {
    res.status(401).json({
      message: "Invalid or Expired Token",
    });
  }
};

module.exports = adminAuth;
