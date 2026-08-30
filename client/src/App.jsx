import React, { useEffect, useRef, useState } from "react";
import MusicPlayer from "./MusicPlayer";
import "./App.css";

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;
uniform float u_count;
uniform vec3 u_cloud;
uniform vec3 u_skyTop;
uniform vec3 u_skyBottom;

const mat2 R = mat2(0.80, 0.60, -0.60, 0.80);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.31, 289.17))) * 26737.367);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * vnoise(p);
    p = R * p * 2.03 + 19.19;
    amp *= 0.5;
  }
  return sum;
}

float billow(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * (1.0 - abs(2.0 * vnoise(p) - 1.0));
    p = R * p * 2.11 + 13.37;
    amp *= 0.5;
  }
  return sum;
}

float cloudDensity(vec2 p, vec2 c, vec2 r, float seed, float t) {
  vec2 q = p - c;
  float ry = q.y > 0.0 ? r.y : r.y * 0.42;
  float env = 1.0 - length(vec2(q.x / r.x, q.y / ry));
  if (env < -0.35) return 0.0;
  vec2 dp = q * (2.4 / r.x) + seed;
  dp += 0.6 * vec2(fbm(dp * 1.4 + t * 0.04), fbm(dp * 1.4 + 7.7 - t * 0.03));
  float detail = billow(dp * 1.6);
  return env + (detail - 0.62) * 0.62;
}

vec3 shadeCloud(vec3 color, vec3 sky, vec2 p, vec2 c, vec2 r, float seed, float t, float dist) {
  float d = cloudDensity(p, c, r, seed, t);
  if (d < 0.02) return color;
  float dUp = cloudDensity(p + vec2(0.0, r.y * 0.55), c, r, seed, t);
  float occl = clamp((dUp - d) * 1.1 + d * 0.55, 0.0, 1.0);
  vec3 lit = u_cloud * 1.04;
  vec3 shadow = mix(u_cloud * 0.60, sky, 0.38);
  vec3 cloudCol = mix(lit, shadow, occl * 0.85);
  float alpha = smoothstep(0.02, 0.38, d);
  float rim = smoothstep(0.02, 0.14, d) * (1.0 - smoothstep(0.14, 0.40, d));
  cloudCol += rim * 0.10;
  cloudCol = mix(cloudCol, sky, dist * 0.35);
  alpha *= mix(1.0, 0.8, dist);
  return mix(color, cloudCol, alpha);
}

vec3 cloudPass(vec3 color, vec3 sky, vec2 p, float aspect, float t, float spd, float phase, float y, vec2 r, float seed, float dist) {
  float cx = mix(-r.x - 0.25, aspect + r.x + 0.25, fract(t * spd + phase));
  float cy = y + sin(t * 0.05 + phase * 6.2831) * 0.012;
  return shadeCloud(color, sky, p, vec2(cx, cy), r, seed, t, dist);
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(v_uv.x * aspect, v_uv.y);
  float t = u_time;
  vec3 sky = mix(u_skyBottom, u_skyTop, v_uv.y);
  vec3 color = sky;
  color = mix(color, u_skyBottom * 1.06, smoothstep(0.35, 0.0, v_uv.y) * 0.5);
  vec2 sunPos = vec2(aspect * 0.78, 0.92);
  float sunDist = length(p - sunPos);
  color += vec3(1.0, 0.95, 0.82) * exp(-sunDist * sunDist * 5.0) * 0.28;

  if (u_count > 5.5) color = cloudPass(color, sky, p, aspect, t, 0.006, 0.10, 0.84, vec2(0.20, 0.10), 43.7, 1.0);
  if (u_count > 4.5) color = cloudPass(color, sky, p, aspect, t, 0.008, 0.62, 0.73, vec2(0.24, 0.12), 71.3, 0.85);
  if (u_count > 3.5) color = cloudPass(color, sky, p, aspect, t, 0.011, 0.33, 0.60, vec2(0.34, 0.16), 17.3, 0.55);
  if (u_count > 2.5) color = cloudPass(color, sky, p, aspect, t, 0.013, 0.80, 0.47, vec2(0.30, 0.15), 29.9, 0.45);
  if (u_count > 1.5) color = cloudPass(color, sky, p, aspect, t, 0.016, 0.05, 0.35, vec2(0.46, 0.20), 91.1, 0.15);
  color = cloudPass(color, sky, p, aspect, t, 0.020, 0.48, 0.20, vec2(0.56, 0.24), 57.2, 0.0);

  gl_FragColor = vec4(color, 1.0);
}
`;

function parseHex(color) {
  const value = color.trim();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      return [parseInt(hex[0]+hex[0],16)/255, parseInt(hex[1]+hex[1],16)/255, parseInt(hex[2]+hex[2],16)/255];
    }
    return [parseInt(hex.slice(0,2),16)/255, parseInt(hex.slice(2,4),16)/255, parseInt(hex.slice(4,6),16)/255];
  }
  const rgb = value.match(/[\d.]+/g);
  return rgb && rgb.length >= 3 ? [Number(rgb[0])/255, Number(rgb[1])/255, Number(rgb[2])/255] : [0.95, 0.95, 0.95];
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function CloudShader({ speed = 1, count = 6, cloudColor = "#fbf8f2", skyTopColor = "#3876ba", skyBottomColor = "#8cbfe8", children }) {
  const canvasRef = useRef(null);
  const paramsRef = useRef({ speed, count, cloudColor, skyTopColor, skyBottomColor });
  paramsRef.current = { speed, count, cloudColor, skyTopColor, skyBottomColor };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return;

    const vert = compile(gl, gl.VERTEX_SHADER, VERT);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vert || !frag) return;

    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const loc = {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      count: gl.getUniformLocation(program, "u_count"),
      cloud: gl.getUniformLocation(program, "u_cloud"),
      skyTop: gl.getUniformLocation(program, "u_skyTop"),
      skyBottom: gl.getUniformLocation(program, "u_skyBottom"),
    };

    let frame = 0;
    let running = true;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      const w = Math.max(1, Math.floor(width * dpr));
      const h = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(loc.res, w, h);
    };

    window.addEventListener("resize", resize);
    resize();

    const start = performance.now();
    const draw = (now) => {
      if (!running) return;
      const p = paramsRef.current;
      const elapsed = ((now - start) / 1000) * p.speed;
      const cloud = parseHex(p.cloudColor);
      const skyTop = parseHex(p.skyTopColor);
      const skyBottom = parseHex(p.skyBottomColor);

      gl.uniform1f(loc.time, elapsed);
      gl.uniform1f(loc.count, p.count);
      gl.uniform3f(loc.cloud, cloud[0], cloud[1], cloud[2]);
      gl.uniform3f(loc.skyTop, skyTop[0], skyTop[1], skyTop[2]);
      gl.uniform3f(loc.skyBottom, skyBottom[0], skyBottom[1], skyBottom[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", overflow: "hidden", margin: 0, padding: 0 }}>
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

function DancingText() {
  const text = "Listen to music • Use AI • Lighten your workload • Enjoy";

  return (
    <div className="dancing-banner">
      {text.split("").map((char, index) => (
        <span 
          key={index} 
          style={{ 
            animationDelay: `${index * 0.05}s`,
            marginRight: char === " " ? "6px" : "0px" 
          }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </div>
  );
}

export default function App() {
  const [userEmail, setUserEmail] = useState(() => {
    const savedEmail = localStorage.getItem("mahax_user");
    const loginTime = localStorage.getItem("mahax_login_time");
    if (savedEmail && loginTime) {
      if (savedEmail === "mahant@gmail.com") return savedEmail;
      const tenHoursInMs = 10 * 60 * 60 * 1000;
      if (Date.now() - parseInt(loginTime, 10) < tenHoursInMs) {
        return savedEmail;
      } else {
        localStorage.removeItem("mahax_user");
        localStorage.removeItem("mahax_login_time");
      }
    }
    return "";
  });

  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestCount, setRequestCount] = useState(0);

  const [musicOn, setMusicOn] = useState(true);
  const [showMusicPopup, setShowMusicPopup] = useState(false);
  const nextIntervalRef = useRef(2 * 60 * 1000);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    let timer;
    const checkInterval = () => {
      timer = setTimeout(() => {
        if (userEmail && !musicOn) {
          setShowMusicPopup(true);
        }
      }, nextIntervalRef.current);
    };

    if (userEmail && !musicOn) {
      checkInterval();
    }

    return () => clearTimeout(timer);
  }, [userEmail, musicOn, showMusicPopup]);

  const handleYes = () => {
    setMusicOn(true);
    setShowMusicPopup(false);
    nextIntervalRef.current *= 2;
  };

  const handleClosePopup = () => {
    setShowMusicPopup(false);
    nextIntervalRef.current *= 2;
  };

  const handleAuth = (e) => {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    const password = passwordInput.trim();

    if (email === "mahant@gmail.com" && password === "mahant123") {
      setAuthError("");
      localStorage.setItem("mahax_user", email);
      localStorage.setItem("mahax_login_time", Date.now().toString());
      setUserEmail(email);
      setMusicOn(true);
      nextIntervalRef.current = 2 * 60 * 1000;
      return;
    }

    if (email === "mahant@gmail.com") {
      setAuthError("Incorrect password for admin.");
      return;
    }

    const guestId = "guest_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("mahax_user", guestId);
    localStorage.setItem("mahax_login_time", Date.now().toString());
    setUserEmail(guestId);
    setMusicOn(true);
    nextIntervalRef.current = 2 * 60 * 1000;
  };

  const handleLogout = () => {
    localStorage.removeItem("mahax_user");
    localStorage.removeItem("mahax_login_time");
    setUserEmail("");
    setEmailInput("");
    setPasswordInput("");
    setAuthError("");
    setMessages([]);
    setRequestCount(0);
    setShowMusicPopup(false);
    setMusicOn(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    if (userEmail !== "mahant@gmail.com" && requestCount >= 30) {
      setMessages((prev) => [...prev, { role: "assistant", content: "You have reached your free limit of 30 requests for this session." }]);
      return;
    }

    const userMsg = input.trim();
    setInput("");
    const updatedMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(updatedMessages);
    setLoading(true);
    if (userEmail !== "mahant@gmail.com") {
      setRequestCount((prev) => prev + 1);
    }

    try {
      const res = await fetch("https://ai-pk9j.onrender.com/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, userId: userEmail, messages: updatedMessages }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error connecting to server." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!userEmail) {
    return (
      <CloudShader>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "14px", width: "320px", padding: "30px", background: "rgba(0, 0, 0, 0.45)", borderRadius: "16px", backdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.15)", color: "#fff", boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.3)" }}>
            <h2 style={{ margin: 0, textAlign: "center", fontSize: "24px", fontWeight: "600" }}>Mahax AI</h2>
            <p style={{ fontSize: "13px", color: "#ddd", textAlign: "center", margin: "0 0 5px 0" }}>Sign in or enter any email to try as a guest (30 limits).</p>
            
            {authError && (
              <div style={{ background: "rgba(220, 50, 50, 0.3)", border: "1px solid rgba(220, 50, 50, 0.5)", color: "#ffb3b3", padding: "8px", borderRadius: "6px", fontSize: "12px", textAlign: "center" }}>
                {authError}
              </div>
            )}

            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="name@example.com"
              required
              style={{ padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", outline: "none", fontSize: "14px" }}
            />
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              required
              style={{ padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", outline: "none", fontSize: "14px" }}
            />
            <button type="submit" style={{ padding: "12px", borderRadius: "8px", border: "none", background: "#3876ba", color: "#fff", cursor: "pointer", fontWeight: "bold", fontSize: "14px", transition: "background 0.2s" }}>
              Continue
            </button>
          </form>
        </div>
      </CloudShader>
    );
  }

  return (
    <CloudShader>
      <DancingText />

      {musicOn && (
        <MusicPlayer 
          playlist={[
            { videoId: "-gwnl6CP5bE", title: "NO LIE (Sped Up)", artist: "Lipa" },
            { videoId: "bDCwO4HsPX4", title: "baby (sped up)", artist: "Justin Bieber" },
            { videoId: "N2MH9O9HA6E", title: "copines (speed up)", artist: "Aya Nakamura" },
            { videoId: "8lkjiMr5yQk", title: "drunk and nasty (sped up)", artist: "Pasarof" },
            { videoId: "OnwyXeeJU5A", title: "Love Me Back Fyahh Beat (Sped Up)", artist: "Trinidad Cardona" }
          ]} 
        />
      )}

      {showMusicPopup && !musicOn && (
        <div style={{ position: "fixed", top: "25px", left: "50%", transform: "translateX(-50%)", width: "320px", padding: "14px 18px", background: "rgba(20, 20, 20, 0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.2)", borderRadius: "12px", color: "#fff", zIndex: 1000, boxShadow: "0 8px 25px rgba(0,0,0,0.5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>Turn on music?</span>
            <button 
              onClick={handleClosePopup} 
              style={{ background: "transparent", border: "none", color: "#aaa", fontSize: "14px", cursor: "pointer", padding: "0", lineHeight: "1" }}
            >
              ✕
            </button>
          </div>
          <p style={{ fontSize: "11px", color: "#ccc", margin: "0 0 10px 0" }}>Would you like to vibe with background music?</p>
          <button 
            onClick={handleYes}
            style={{ width: "100%", padding: "6px", background: "#3876ba", border: "none", borderRadius: "6px", color: "#fff", fontWeight: "600", fontSize: "12px", cursor: "pointer" }}
          >
            Yes
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="home-screen">
          <div style={{ position: "absolute", top: "20px", right: "20px", display: "flex", alignItems: "center", gap: "12px", zIndex: 20 }}>
            <span style={{ color: "#fff", fontSize: "13px", background: "rgba(0,0,0,0.4)", padding: "6px 12px", borderRadius: "20px", backdropFilter: "blur(5px)" }}>
              {userEmail === "mahant@gmail.com" ? "Admin (Unlimited)" : `Guest (${30 - requestCount} left)`}
            </span>
            <button className="new-chat-btn" onClick={handleLogout} style={{ background: "rgba(220, 50, 50, 0.8)", borderColor: "transparent" }}>
              Logout
            </button>
          </div>
          <div className="title-wrapper">
            <h1 className="home-title">What can I help you with?</h1>
          </div>
          <form onSubmit={sendMessage} className="search-bar-container">
            <div className="search-input-wrapper">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything..."
              />
              <button type="submit" className="new-chat-btn" style={{ marginLeft: "8px" }}>
                Send
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="chat-screen">
          <div className="chat-header">
            <div className="brand-badge">
              <span className="pulse-dot"></span>
              <span>Mahax AI</span>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ color: "#fff", fontSize: "12px", opacity: 0.8 }}>
                {userEmail === "mahant@gmail.com" ? "Admin" : `Requests: ${requestCount}/30`}
              </span>
              <button className="new-chat-btn" onClick={() => setMessages([])}>
                Clear Chat
              </button>
              <button className="new-chat-btn" onClick={handleLogout} style={{ background: "rgba(220, 50, 50, 0.8)", borderColor: "transparent" }}>
                Logout
              </button>
            </div>
          </div>

          <div className="messages-area">
            {messages.map((m, idx) => (
              <div key={idx} className={`message-bubble ${m.role === "user" ? "user" : "ai"}`}>
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="message-bubble ai typing-bubble">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="bottom-input-bar">
            <form onSubmit={sendMessage} className="fixed-width search-input-wrapper" style={{ margin: 0 }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything..."
              />
              <button type="submit" className="new-chat-btn" style={{ marginLeft: "8px" }}>
                Send
              </button>
            </form>
          </div>
        </div>
      )}
      </CloudShader>
  );
}