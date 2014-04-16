var fs = require('fs');
var yaml = require('js-yaml');
var path = require('path');
var execSync = require('execSync');
var tmp = require('tmp');
var rl = require('readline');
var path = require('path');

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

var cleanup = function(ctrId) {
  console.log("Cleaning up.")
  execSync.exec("docker kill " + ctrId);
  execSync.exec("docker rm "+ ctrId);
  process.exit();
};

var commitAndTag = function(ctrId, tag) {
  console.log("Committing and tagging image.");
  var info = execSync.exec("docker commit " + ctrId);
  var imgId = info.stdout.trim();
  console.log("Image id is ", imgId);
  execSync.exec("docker tag " + imgId + " " + tag);
  cleanup(ctrId);
};

// Cribbed from https://coderwall.com/p/v16yja
var ask = function(question, callback) {
  var r = rl.createInterface({
    input: process.stdin,
    output: process.stdout});
  r.question(question + ' ', function(answer) {
    r.close();
    callback(null, answer);
  });
};

var yesses = {y: true, Y: true, yes: true, Yes: true, YES: true}

var execDebugBuild = function(opts) {
  tmp.dir(function(err, dirPath) {
    if (err) {
      throw err;
    }
    
    var ctrIdPath = path.join(dirPath, "ctrId");
    fs.writeFileSync(ctrIdPath, "");

    var rcFilePath = path.join(dirPath, "rcFile");
    var ansibleCmd = 'ansible-playbook /dockerflow/dockerflow.yml -c local -i "127.0.0.1,"';
    var rcFileContents = [
      "echo $HOSTNAME > /tmp/dockerflow-ctrId",
      "history -s '" + ansibleCmd + "'",
      ansibleCmd
    ].join("\n");
    fs.writeFileSync(rcFilePath, rcFileContents);
    
    var extraMounts = "-v " + ctrIdPath + ":/tmp/dockerflow-ctrId" + " -v " + rcFilePath + ":/tmp/dockerflow-commands";
    var ctrCmd = "/bin/bash -c '/bin/bash --rcfile /tmp/dockerflow-commands'";
    console.log("Dropping you into the debug container. Build will begin immediately.");
    var runCmd = ["docker", opts.host, "run -i -t", extraMounts, opts.dockerOptions, opts.base, ctrCmd].join(" ");
    
    execSync.run(runCmd);
    
    var ctrId = fs.readFileSync(ctrIdPath).toString().trim();
    
    ask("Commit and tag this image? (default: no)", function(err, answer) {
      if (err) {
        throw err;
      }
      if (yesses[answer.trim()]) {
        commitAndTag(ctrId, opts.tag);
      } else {
        cleanup(ctrId);
      }
    });
  });
};

var execBuild = function(opts) {
  var ctrCmd = "ansible-playbook /dockerflow/dockerflow.yml -c local -i \"127.0.0.1,\"";
  
  var runCmd = ["docker", opts.host, "run -i -t -d", opts.dockerOptions, opts.base, ctrCmd].join(" ");
  var info = execSync.exec(runCmd);
  if (info.code) {
    console.log("Unable to start container, code " + info.code + ": " + info.stdout);
    process.exit();
  }
  var ctrId = info.stdout.trim();

  var interrupted = false;
  process.on('SIGINT', function() {
    interrupted = true;
    cleanup(ctrId);
  });
  
  execSync.run("docker logs -f " + ctrId);
  
  var exitCode = execSync.run("docker wait " + ctrId);
  if (exitCode || interrupted) {
    console.log("Build failed or interrupted, not tagging image.");
    cleanup(ctrId);
  }
  console.log("Build completed successfully.");
  commitAndTag(ctrId, opts.tag)
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