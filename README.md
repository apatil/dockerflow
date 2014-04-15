# Dockerflow

Smooth and simple [Docker](http://docker.io) image development with [Ansible](http://www.ansible.com/home). Small configuration changes result in quick incremental updates of development images.

To build an image from scratch:

```
dockerflow build .
```

To rebuild the image incrementally after changing a playbook or file:

```
dockerflow rebuild .
```

To drop into a shell inside the container when the build fails so you can figure out what happened interactively:

```
dockerflow debug-build .
```


## Why?

Existing Docker build systems don't support my preferred development workflow, which has four actions:

- **build**: Build an image from a base image and a configuration spec.
- **rebuild**: Make a change to the configuration spec; efficiently build an incremental update of the current build.
- **debug-build**: Attempt to build an image from the base image and configuration spec, but drop into a shell inside the container on failure so I can identify the problem interactively.
- **debug-rebuild**: Like debug-build, but with rebuild.

### Why not [Dockerfiles](https://github.com/ansible/ansible)?

Dockerfiles are fine for 'build', but can be inefficient for 'rebuild'. Consider the following Dockerfile:

```
RUN apt-get install x y z
RUN long-running-source-build
...
```

If you remember that the subsequent steps also require `apt-get install w`, you can either add `w` to the existing apt-get install line, which means you have to wait for your long-running source build to finish again; or add a second `apt-get install` line further down, which gets confusing.

Also, I like Ansible's declarative approach to configuration better than Dockerfiles' imperative one.

If you also like Ansible but care about sticking with Dockerfiles more than 'rebuild', check [this](http://www.ansible.com/blog/2014/02/12/installing-and-building-docker-with-ansible) out.

### Why not [Packer](http://packer.io)?

I don't want the output to be complete tarballs of images, but tagged Docker images that I can push. Also, I want an easy incremental option.

## Installation

Install [Node.js](http://nodejs.org), then `sudo npm install -g dockerflow`.

## Usage

`dockerflow action path [options]`, where action can be build, rebuild, debug-build or debug-rebuild.

In more or less the spirit of Dockerfiles, the given path should contain an Ansible playbook called 'dockerflow.yml' which specifies the configuration. In addition, the given path will be available inside the container read-only at `/dockerflow` during the build, but will not be bundled into the image.

The playbook should define the following [variables](http://docs.ansible.com/playbooks_variables.html#variables-defined-in-a-playbook):

- dockerflow-base: The id or tag of the image from which the build should start.
- dockerflow-tag: The tag that will be applied to the output image.
- dockerflow-docker-options (optional): An arbitrary string of options to pass to the Docker client.
- dockerflow-environment (optional): A space-separated list of environmental variables to forward into the container. You can access environmental from playbooks using [this method](http://docs.ansible.com/faq.html#how-do-i-access-shell-environment-variables) or [this method](https://groups.google.com/forum/#!msg/ansible-project/e0erq3FLR5I/vzXm3R8c0BEJ).

Alternatively, these options can be set using command line options `--base`, `--tag`, `--docker-options` and `--environment`. Command line options override config file options.