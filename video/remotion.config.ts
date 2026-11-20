import { Config } from "@remotion/cli/config";

// 1920x1080 at 60fps is set on the composition in src/Root.tsx, which is the
// authority Remotion renders against. The codec and quality settings live here.
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
Config.setOverwriteOutput(true);

// The 3D set pieces draw through WebGL in headless Chrome. "angle" is the
// renderer that actually works on Windows without a real GPU attached; the
// default picks software paths that drop frames in @remotion/three scenes.
Config.setChromiumOpenGlRenderer("angle");

export {};
