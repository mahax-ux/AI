import React, { useState, useRef, useEffect } from "react";
import "./MusicPlayer.css";

export default function MusicPlayer({ playlist = [] }) {
  const playerRef = useRef(null);
  const intervalRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const currentTrack = playlist[currentIndex] || playlist[0];

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = initPlayer;
    } else {
      initPlayer();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Load new track when index changes
  useEffect(() => {
    if (isReady && playerRef.current && playerRef.current.loadVideoById) {
      playerRef.current.loadVideoById(currentTrack.videoId);
      if (isPlaying) {
        playerRef.current.playVideo();
      }
    }
  }, [currentIndex]);

  const initPlayer = () => {
    playerRef.current = new window.YT.Player("youtube-hidden-player", {
      height: "0",
      width: "0",
      videoId: currentTrack.videoId,
      playerVars: {
        controls: 0,
        playsinline: 1,
      },
      events: {
        onReady: (event) => {
          setIsReady(true);
          setDuration(event.target.getDuration());
        },
        onStateChange: (event) => {
          // event.data === 1 -> Playing
          // event.data === 0 -> Ended
          if (event.data === 1) {
            setIsPlaying(true);
          } else if (event.data === 0) {
            // Automatically loop to the next song in the playlist
            setCurrentIndex((prevIndex) => (prevIndex + 1) % playlist.length);
          } else {
            setIsPlaying(false);
          }
        },
      },
    });
  };

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        if (playerRef.current && playerRef.current.getCurrentTime) {
          const current = playerRef.current.getCurrentTime();
          const total = playerRef.current.getDuration() || 1;
          setDuration(total);
          setProgress((current / total) * 100);
        }
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying]);

  const togglePlay = () => {
    if (!isReady || !playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const nextTrack = () => {
    setCurrentIndex((prev) => (prev + 1) % playlist.length);
    setIsPlaying(true);
  };

  const handleSeek = (e) => {
    if (!isReady || !playerRef.current) return;
    const seekPercent = e.target.value;
    const seekTime = (seekPercent / 100) * duration;
    playerRef.current.seekTo(seekTime, true);
    setProgress(seekPercent);
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return (
    <div className="music-player-card">
      <div id="youtube-hidden-player" style={{ display: "none" }}></div>

      <div className="player-info">
        <div className="track-icon">🎵</div>
        <div className="track-details">
          <span className="track-title">{currentTrack.title}</span>
          <span className="track-artist">{currentTrack.artist}</span>
        </div>
      </div>

      <div className="player-controls">
        <button className="control-btn play-pause-btn" onClick={togglePlay} disabled={!isReady}>
          {isPlaying ? "❚❚" : "▶"}
        </button>

        {playlist.length > 1 && (
          <button className="control-btn next-btn" onClick={nextTrack} title="Next Song" disabled={!isReady}>
            ⏭
          </button>
        )}

        <div className="progress-container">
          <span className="time-text">
            {playerRef.current && isReady ? formatTime(playerRef.current.getCurrentTime()) : "0:00"}
          </span>
          <input
            type="range"
            className="seek-bar"
            value={progress}
            onChange={handleSeek}
            min="0"
            max="100"
            disabled={!isReady}
          />
          <span className="time-text">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}