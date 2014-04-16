var fs = require('fs');
var yaml = require('js-yaml');
var path = require('path');
var execSync = require('execSync');

var readConfig = function(buildPath, opts) {
  var playbookPath = path.join(buildPath, 'dockerflow.yml');
  if (!fs.existsSync(playbookPath)) {
    throw new Error("dockerflow.yml not found in " + buildPath);
  }
  var playbookYml = yaml.safeLoad(fs.readFileSync(playbookPath, 'utf8'));
  var vars = playbookYml[0].vars;

  var envSpec = opts["environment"] || vars["dockerflow-environment"];
  var envKeys = [];
  if (envSpec) {
    envKeys = envSpec.split(" ");
  }
  var envOpts = [];
  for (var i = 0; i < envKeys.length; i++) {
    var k = envKeys[i];
    envOpts.push("-e " + k + "=$" + k);
  }
  
  var host = opts.H || opts.host;
  if (host) {
    host = "-H " + host;
  } else {
    host = ""
  }
  return {
    host:  host,
    base: opts["base"] || vars["dockerflow-base"],
    tag: opts["tag"] || vars["dockerflow-tag"],
    dockerOptions: "-v " + buildPath + ":/dockerflow:ro " + envOpts.join(" ") + " " + (opts["docker-options"] || vars["dockerflow-docker-options"] || "")
  };
};

var execDebugBuild = function(opts) {
  var ctrCmd = " /bin/bash -c \"/bin/bash  --rcfile <(echo 'ansible-playbook /dockerflow/dockerflow.yml -c local -i \\\"127.0.0.1,\\\"')\"";
  console.log("Dropping you into the debug container. Build will begin immediately.");
  var runCmd = "docker " + opts.host + " run -i -t --rm " + opts.dockerOptions + " " +opts.base + " " + ctrCmd;
  var cp = execSync.run(runCmd);
  console.log("Not tagging image in debug mode.");
};

var execBuild = function(opts) {
  var ctrCmd = "ansible-playbook /dockerflow/dockerflow.yml -c local -i \"127.0.0.1,\"";
  
  var runCmd = "docker " + opts.host + " run -i -t -d " + opts.dockerOptions + " " + opts.base + " " + ctrCmd;
  var info = execSync.exec(runCmd);
  if (info.code) {
    console.log("Unable to start container, code " + info.code + ": " + info.stdout);
    process.exit();
  }
  var ctrId = info.stdout.trim();
  
  var interrupted = false;
  var cleanup = function() {
    process.removeListener('SIGINT', cleanup);
    interrupted = true;
    console.log("Cleaning up.")
    execSync.exec("docker kill " + ctrId);
    execSync.exec("docker rm "+ ctrId);
    process.exit();
  };
  process.on('SIGINT', cleanup);
  
  execSync.run("docker logs -f " + ctrId);
  
  var exitCode = execSync.exec("docker wait " + ctrId);
  
  if (exitCode || interrupted) {
    console.log("Build failed or interrupted, not tagging image.");
    cleanup();
  }
  console.log("Build completed successfully, committing and tagging image.");
  info = execSync.exec("docker commit " + ctrId);
  var imgId = info.stdout.trim();
  console.log("Image id is ", imgId);
  execSync.exec("docker tag " + imgId + " " + opts.tag);
  cleanup();
};

var build = exports.build = function build(buildPath, opts) {
  var imgs = readConfig(buildPath, opts);
  execBuild(imgs);
};

var rebuild = exports.rebuild = function rebuild(buildPath, opts) {
  var imgs = readConfig(buildPath, opts);
  imgs.base = imgs.tag;
  execBuild(imgs);
};

var debugBuild = exports["debug-build"] = function debugBuild(buildPath, opts) {
  var imgs = readConfig(buildPath, opts);
  execDebugBuild(imgs);
};

var debugRebuild = exports["debug-rebuild"] = function debugRebuild(buildPath, opts) {
  var imgs = readConfig(buildPath, opts);
  imgs.base = imgs.tag;
  execDebugBuild(imgs);
}