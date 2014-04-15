var fs = require('fs');
var yaml = require('js-yaml');
var path = require('path');
var execSync = require('execSync');

var readConfig = function(buildPath) {
  var playbookPath = path.join(buildPath, 'dockerflow.yml');
  if (!fs.existsSync(playbookPath)) {
    throw new Error("dockerflow.yml not found in " + buildPath);
  }
  var playbookYml = yaml.safeLoad(fs.readFileSync(playbookPath, 'utf8'));
  var vars = playbookYml[0].vars;

  var envKeys = [];
  if (vars["dockerflow-environment"]) {
    envKeys = vars["dockerflow-environment"].split(" ");
  }
  var envOpts = [];
  for (var i = 0; i < envKeys.length; i++) {
    var k = envKeys[i];
    envOpts.push("-e " + k + "=$" + k);
  }

  return {
    base: vars["dockerflow-base"],
    tag: vars["dockerflow-tag"],
    dockerOptions: "-v " + buildPath + ":/dockerflow:ro " + envOpts.join(" ") + " " + (vars["dockerflow-docker-options"] || "")
  };
};

var execDebugBuild = function(base, tag, options) {
  var ctrCmd = " /bin/bash -c \"/bin/bash  --rcfile <(echo 'ansible-playbook /dockerflow/dockerflow.yml -c local -i \\\"127.0.0.1,\\\"')\"";
  console.log("Dropping you into the debug container. Build will begin immediately.");
  var runCmd = "docker run -i -t --rm " + options + " " + base + " " + ctrCmd;
  var cp = execSync.run(runCmd);
  console.log("Not tagging image in debug mode.");
};

var execBuild = function(base, tag, options) {
  var ctrCmd = "ansible-playbook /dockerflow/dockerflow.yml -c local -i \"127.0.0.1,\"";
  
  var runCmd = "docker run -i -t -d " + options + " " + base + " " + ctrCmd;
  var info = execSync.exec(runCmd);
  if (info.code) {
    console.log("Unable to start container, code " + info.code + ": " + info.stdout);
    process.exit();
  }
  var ctrId = info.stdout.trim();
  var cleanup = function() {
    execSync.run("docker kill " + ctrId);
    execSync.run("docker rm "+ ctrId);
    process.exit();
  };
  
  process.on('SIGINT', cleanup);
  execSync.run("docker logs -f " + ctrId);
  var codeInfo = execSync.exec("docker wait " + ctrId);
  if (parseInt(codeInfo.stdout.trim())) {
    console.log("Build failed, not tagging image.");
    process.exit();
  }
  console.log("Build completed successfully, committing and tagging image.");
  info = execSync.exec("docker commit " + ctrId);
  var imgId = info.stdout.trim();
  execSync.run("docker tag " + imgId + " " + tag);
  process.removeListener('SIGINT', cleanup);
  cleanup();
};

var build = exports.build = function build(buildPath) {
  var imgs = readConfig(buildPath);
  execBuild(imgs.base, imgs.tag, imgs.dockerOptions);
};

var rebuild = exports.rebuild = function rebuild(buildPath) {
  var imgs = readConfig(buildPath);
  execBuild(imgs.tag, imgs.tag, imgs.dockerOptions);
};

var debugBuild = exports["debug-build"] = function debugBuild(buildPath) {
  var imgs = readConfig(buildPath);
  execDebugBuild(imgs.base, imgs.tag, imgs.dockerOptions);
};

var debugRebuild = exports["debug-rebuild"] = function debugRebuild(buildPath) {
  var imgs = readConfig(buildPath);
  execDebugBuild(imgs.tag, imgs.tag, imgs.dockerOptions);
}