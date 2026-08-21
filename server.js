const { tunnel: cloudflaredTunnel } = require("cloudflared")
const cookieParser = require("cookie-parser")
const socketIO = require("socket.io")
const config = require("./config")
const express = require("express")
const tarkine = require("tarkine")
const http = require('http')

const app = express()
const server = http.createServer(app)
const io = new socketIO.Server(server)
const PORT = process.env.PORT || config.port
global.remoteURL = ""

global.IO = io

app.set("view engine", "html")
app.engine("html", tarkine.renderFile)
app.use(cookieParser())
app.use(express.urlencoded({ extended: false, limit: "50mb" }))
app.use(express.static(__dirname + "/public"))
app.use(express.json({ limit: "50mb" }))

app.use("/", require("./router"))

if (require.main === module) {
    server.listen(PORT, async () => {
        const localURL = `http://localhost:${PORT}`
        console.log(`LOCAL  : ${localURL}`)
        try {
            global.remoteURL = await cloudflaredTunnel({
                "--url": localURL
            }).url
            console.log(`REMOTE : ${global.remoteURL}`)
        } catch (err) {
            console.log(`REMOTE : Cloudflared Tunnel Skipped (${err.message})`)
            global.remoteURL = localURL
        }
    })
}

module.exports = app