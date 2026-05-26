import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// 10 seconds @ 30fps — loopable abstract tech background
export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
  />
);