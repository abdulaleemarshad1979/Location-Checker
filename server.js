const cookieParser = require("cookie-parser")
const socketIO = require("socket.io")
const config = require("./config")
const express = require("express")
const tarkine = require("tarkine")
const http = require('http')
const path = require("path")

const app = express()
const server = http.createServer(app)
const io = new socketIO.Server(server)
const PORT = process.env.PORT || config.port
global.remoteURL = ""

global.IO = io

app.disable("x-powered-by")
app.set("views", path.join(__dirname, "views"))
app.set("view engine", "html")
app.engine("html", tarkine.renderFile)
app.use(cookieParser())
app.use(express.urlencoded({ extended: false, limit: "64kb" }))
app.use(express.static(path.join(__dirname, "public")))
app.use(express.json({ limit: "256kb" }))

io.use((socket, next) => {
    const cookieHeader = socket.request.headers.cookie || ""
    let cookies = {}
    try {
        cookies = Object.fromEntries(cookieHeader.split(";").map(part => {
            const separator = part.indexOf("=")
            if (separator < 0) return ["", ""]
            const key = part.slice(0, separator).trim()
            const value = decodeURIComponent(part.slice(separator + 1).trim())
            return [key, value]
        }))
    } catch (_error) {
        return next(new Error("Invalid authentication cookie"))
    }

    if (cookies.token === config.token) return next()
    return next(new Error("Authentication required"))
})

app.use("/", require("./router"))

if (require.main === module) {
    server.listen(PORT, async () => {
        const localURL = `http://localhost:${PORT}`
        console.log(`LOCAL  : ${localURL}`)
        if (process.env.DISABLE_TUNNEL === "1") {
            global.remoteURL = localURL
            return
        }
        try {
            const { tunnel: cloudflaredTunnel } = require("cloudflared")
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
