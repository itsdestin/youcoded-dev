import { Config } from '@remotion/cli/config';
// WHY: the machine's own Chrome, so nothing is downloaded at render time; PNG frames so
// gradients and the lavender field do not band the way JPEG frames do.
Config.setBrowserExecutable('/usr/bin/google-chrome-stable');
Config.setVideoImageFormat('png');
Config.setOverwriteOutput(true);
