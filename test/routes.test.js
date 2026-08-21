"use strict"

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const request = require("supertest")
const express = require("express")
const cookieParser = require("cookie-parser")
const path = require("path")
const tarkine = require("tarkine")
const router = require("../router")

const app = express()
app.set("views", path.join(__dirname, "..", "views"))
app.set("view engine", "html")
app.engine("html", tarkine.renderFile)
app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use("/", router)

describe("Telemetry Ingestion API", () => {
  it("should successfully log telemetry with IP fallback data when GPS is absent", async () => {
    const res = await request(app)
      .post("/api/telemetry")
      .send({
        lat: 17.3850,
        lng: 78.4867,
        source: "ip_lookup"
      })

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.status, "success")
    assert.equal(res.body.dataReceived, true)
  })

  it("should handle native camera / media file uploads securely", async () => {
    const res = await request(app)
      .post("/api/telemetry")
      .field("lat", "17.3850")
      .field("lng", "78.4867")
      .field("source", "hardware_gps")
      .attach("media", Buffer.from("fake-image-bytes"), "snapshot.jpg")

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.status, "success")
    assert.equal(res.body.dataReceived, true)
    assert.ok(res.body.payload.media)
  })

  it("should render public portal pages and login route", async () => {
    let res = await request(app).get("/login")
    assert.equal(res.statusCode, 200)
    assert.match(res.text, /Sign In/i)

    res = await request(app).get("/location?ref=TEST-001")
    assert.equal(res.statusCode, 200)
    assert.match(res.text, /No information has been shared/i)
  })
})
