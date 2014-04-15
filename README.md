# Dockerflow

Smooth and simple [Docker](http://docker.io) image development with [Ansible](http://www.ansible.com/home). Small configuration changes result in quick incremental updates of development images.

## Why?

Existing Docker build systems don't support my preferred development workflow, which has four actions:

- build: Build an image from a base image and a configuration spec. Dockerfiles are fine for this.
- rebuild: Make a change to the configuration spec; efficiently build an incremental update of the current build.
- debug-build: Attempt to build an image from the base image and configuration spec, but drop into a shell inside the container on failure so I can identify the problem interactively.
- debug-rebuild: Like debug-pack, but with repack.

### Why not [Dockerfiles](https://github.com/ansible/ansible)?

Dockerfiles are fine for 'build', but can be inefficient for 'rebuild'. Consider the following Dockerfile:

```
RUN apt-get install x y z
RUN long-running-source-build
...
```

If you remember that the subsequent steps also require `apt-get install w`, you can either:

- Add `w` to the existing apt-get install line, which means you have to wait for your long-running source build to finish again; or
- Add a second `apt-get install` line further down, which gets confusing.

Also, I want the images in my repository to correspond to development iterations, not steps in a Dockerfile.

Finally, I like Ansible's declarative approach to configuration management better than Dockerfiles' imperative one.

### Why not [Packer](http://packer.io)?

I don't want the output to be complete tarballs of images, I want to output tagged Docker images that I can push. Also, I want an easy incremental option.

## Usage

`dockerflow action path`, where action can be build, rebuild, debug-build or debug-rebuild.

In more or less the spirit of Dockerfiles, the given path should contain an Ansible playbook called 'dockerflow.yml' which runs the build. In addition, the given path will be available read-only at `/dockerflow` during the build, but will not be bundled into the image.

The playbook must define the vars `dockerflow-base`, which gives the id or tag of the image from which the build should start, and `dockerflow-tag`, which gives the tag that will be applied to the output image.

It may optionally define `dockerflow-docker-options`, which can be an arbitrary string of options to pass to the Docker daemon, and `dockerflow-env`, which is a space-separated list of environmental variables to forward into the container. You can access environmental from playbooks using [this method](http://docs.ansible.com/faq.html#how-do-i-access-shell-environment-variables) or [this method](https://groups.google.com/forum/#!msg/ansible-project/e0erq3FLR5I/vzXm3R8c0BEJ).