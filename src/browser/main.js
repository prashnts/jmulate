"use strict";

(function()
{
    var on_bios_load;

    function dump_file(ab, name)
    {
        var blob = new Blob([ab]);

        var a = document.createElement("a");
        a["download"] = name;
        a.href = window.URL.createObjectURL(blob),
        a.dataset["downloadurl"] = ["application/octet-stream", a["download"], a.href].join(":");
        
        if(document.createEvent)
        {
            var ev = document.createEvent("MouseEvent");
            ev.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
            a.dispatchEvent(ev);
        }
        else
        {
            a.click();
        }
    }

    function get_query_arguments()
    {
        var query = location.search.substr(1).split("&"),
            param,
            parameters = {};

        for(var i = 0; i < query.length; i++)
        {
            param = query[i].split("=");
            parameters[param[0]] = param[1];
        }

        return parameters;
    }

    function set_title(text)
    {
        document.title = text + " - Jmulate x86" +  (DEBUG ? " - debug" : "");
    }

    function time2str(time)
    {
        if(time < 60)
        {
            return time + "s";
        }
        else if(time < 3600)
        {
            return (time / 60 | 0) + "m " + String.pad0(time % 60, 2) + "s";
        }
        else
        {
            return (time / 3600 | 0) + "h " + 
                String.pad0((time / 60 | 0) % 60, 2) + "m " + 
                String.pad0(time % 60, 2) + "s";
        }
    }

    function lock_mouse(elem)
    {
        var fn = elem["requestPointerLock"] ||
                    elem["mozRequestPointerLock"] ||
                    elem["webkitRequestPointerLock"];

        if(fn)
        {
            fn.call(elem);
        }
    }

    function chr_repeat(chr, count)
    {
        var result = "";

        while(count-- > 0)
        {
            result += chr;
        }

        return result;
    }

    function show_progress(info, e)
    {
        // Removed this method. PS
        return;

        var el = _("loading");
        el.style.display = "block";

        if(e.lengthComputable || (info.total && typeof e.loaded === "number"))
        {
            var per100 = e.loaded / (e.total || info.total) * 100 | 0;

            per100 = Math.min(100, Math.max(0, per100));

            el.textContent = info.msg + " " + per100 + "% [" + 
                chr_repeat("#", per100 >> 1) + 
                chr_repeat(" ", 50 - (per100 >> 1)) + "]";
        }
        else
        {
            if(!info.ticks)
                info.ticks = 0;

            el.textContent = info.msg + " " + chr_repeat(".", info.ticks++ % 50);
        }
    }

    function _(id)
    {
        if(!document.getElementById(id))
            console.log("Element with id `" + id + "` not found");

        return document.getElementById(id);
    }

    function onload()
    {
        if(!("responseType" in new XMLHttpRequest))
        {
            alert("Your browser is not supported because it doesn't have XMLHttpRequest.responseType");
            return;
        }

        var settings = {
            load_devices: true
        };

        function load_local(file, type, cont)
        {
            set_title(file.name);

            // SyncFileBuffer:
            // - loads the whole disk image into memory, impossible for large files (more than 1GB)
            // - can later serve get/set operations fast and synchronously 
            // - takes some time for first load, neglectable for small files (up to 100Mb)
            //
            // AsyncFileBuffer:
            // - loads slices of the file asynchronously as requested
            // - slower get/set

            // Heuristics: If file is smaller than 64M, use SyncFileBuffer
            if(file.size < 64 * 1024 * 1024)
            {
                var loader = new SyncFileBuffer(file);
                loader.onprogress = show_progress.bind(this, { msg: "Loading disk image into memory" });
            }
            else
            {
                var loader = new AsyncFileBuffer(file);
            }

            loader.onload = function()
            {
                switch(type)
                {
                case "floppy": 
                   settings.fda = loader;
                   break;
                case "hd": 
                   settings.hda = loader;
                   break;
                case "cdrom": 
                   settings.cdrom = loader;
                   break;
                }
                cont();
            }

            loader.load();
        }

        var biosfile = DEBUG ? "seabios-debug.bin" : "seabios.bin";
        var vgabiosfile = DEBUG ? "vgabios-0.7a.debug.bin" : "bochs-vgabios-0.7a.bin";

        load_file("bios/" + biosfile, function(img)
        {
            settings.bios = img;

            if(on_bios_load) on_bios_load();
        });

        //load_file("bios/vgabios.bin", function(img)
        load_file("bios/" + vgabiosfile, function(img)
        {
            settings.vga_bios = img;

            if(on_bios_load) on_bios_load();
        });

        _("start_emulation").onclick = function()
        {
            _("boot_options").style.display = "none";

            var images = [];

            if(_("floppy_image").files.length)
            {
                images.push({
                    file: _("floppy_image").files[0],
                    type: "floppy",
                });
            }

            if(_("cd_image").files.length)
            {
                images.push({
                    file: _("cd_image").files[0],
                    type: "cdrom",
                });
            }

            if(_("hd_image").files.length)
            {
                images.push({
                    file: _("hd_image").files[0],
                    type: "hd",
                });
            }

            function cont()
            {
                if(images.length === 0)
                {
                    init(settings, function(cpu)
                    {
                        cpu.run();
                    });
                }
                else
                {
                    var obj = images.pop();

                    load_local(obj.file, obj.type, cont);
                }
            }

            cont();
        };

        if(DEBUG)
        {
            debug_onload(settings);
        }

        var oses = [
            {
                id: "freedos",
                fda: "images/freedos722.img",
                size: 737280,
                name: "FreeDOS",
            },
            {
                id: "windows1",
                fda: "images/windows101.img",
                size: 1474560,
                name: "Windows",
            },
            {
                id: "linux26",
                cdrom: "images/linux.iso",
                size: 5666816,
                name: "Linux",
            },
            {
                id: "damnsmall",
                cdrom: "images/dsl.iso",
                size: 52824064,
                name: "Damn Small Linux"
            }
        ];

        var profile = get_query_arguments().profile;

        for(var i = 0; i < oses.length; i++)
        {
            var infos = oses[i];
            var dom_id = "start_" + infos.id;

            _(dom_id).onclick = function(infos)
            {
                var message = { msg: "Downloading image", total: infos.size };
                var image = infos.state || infos.fda || infos.cdrom;

                load_file(
                    image, 
                    loaded.bind(this, infos, settings), 
                    show_progress.bind(this, message)
                );

                var update_history;
                if(profile === infos.id)
                {
                    update_history = window.history.replaceState;
                }
                else
                {
                    update_history = window.history.pushState;
                }

                if(update_history)
                {
                    update_history.call(window.history, { profile: infos.id }, "", "?profile=" + infos.id);
                }

                set_title(infos.name);
                _(dom_id).blur();
                _("boot_options").style.display = "none";

            }.bind(this, infos);

            if(profile === infos.id)
            {
                _(dom_id).onclick();
                return;
            }
        }

        function loaded(infos, settings, buffer)
        {
            settings.memory_size = infos.memory_size;
            settings.vga_memory_size = infos.vga_memory_size;

            if(infos.async_hda)
            {
                settings.hda = new AsyncXHRBuffer(
                    infos.async_hda,
                    512, 
                    infos.async_hda_size
                );
            }

            if(infos.fda)
            {
                settings.fda = new SyncBuffer(buffer);
            }
            else if(infos.cdrom)
            {
                settings.cdrom = new SyncBuffer(buffer);
            }

            init(settings, function(cpu)
            {
                if(infos.state)
                {
                    cpu.restore_state(buffer);
                }

                cpu.run();
            });
        }
    }

    function debug_onload(settings)
    {
        // called on window.onload, in debug mode

        _("restore_state").onchange = function()
        {
            var file = _("restore_state").files[0];

            if(!file)
            {
                return;
            }

            var cpu = new v86();
            var fr = new FileReader();

            fr.onload = function(e)
            {
                init(settings, function(cpu)
                {
                    cpu.restore_state(e.target.result);
                    cpu.run();
                });
            }

            fr.readAsArrayBuffer(file);
        };

        _("start_test").onclick = function()
        {
            //settings.hda = new AsyncXHRBuffer("http://localhost:8000/images/arch3.img", 512, 8589934592);
            settings.memory_size = 128 * 1024 * 1024;
            settings.vga_memory_size = 128 * 1024 * 1024;

            load_file("/images/v86state.bin", function(buffer)
            {
                init(settings, function(cpu)
                {
                    cpu.restore_state(buffer);
                    cpu.run();
                });
            });
        };

        var log_levels = document.getElementById("log_levels"),
            count = 0,
            mask;

        for(var i in dbg_names)
        {
            mask = +i;

            if(mask == 1)
                continue;

            var name = dbg_names[mask].toLowerCase(),
                input = document.createElement("input"),
                label = document.createElement("label");

            input.type = "checkbox";

            label.htmlFor = input.id = "log_" + name;

            if(LOG_LEVEL & mask)
            {
                input.checked = true;
            }
            input.mask = mask;

            label.appendChild(input);
            label.appendChild(document.createTextNode(name + " "));
            log_levels.appendChild(label);
        }

        log_levels.onchange = function(e)
        {
            var target = e.target,
                mask = target.mask;

            if(target.checked)
            {
                LOG_LEVEL |= mask;
            }
            else
            {
                LOG_LEVEL &= ~mask;
            }
        };
    }

    window.addEventListener("load", onload, false);
    window.addEventListener("popstate", onpopstate, false);

    // works in firefox and chromium
    if(document.readyState === "complete")
    {
        onload();
    }

    function init(settings, done)
    {
        if(!settings.bios || !settings.vga_bios)
        {
            on_bios_load = init.bind(this, settings, done);
            return;
        }

        var cpu = new v86();

        if(DEBUG)
        {
            debug_start(cpu);
        }

        // avoid warnings
        settings.fdb = undefined;

        settings.screen_adapter = new ScreenAdapter(_("screen_container"));;
        settings.keyboard_adapter = new KeyboardAdapter();
        settings.mouse_adapter = new MouseAdapter();

        settings.boot_order = parseInt(_("boot_order").value, 16);
        //settings.serial_adapter = new SerialAdapter(_("serial"));
        //settings.serial_adapter = new ModemAdapter();
        //settings.network_adapter = new NetworkAdapter("ws://localhost:8001/");
        //settings.network_adapter = new NetworkAdapter("ws://relay.widgetry.org/");

        if(!settings.memory_size)
        {
            var memory_size = parseInt(_("memory_size").value, 10) * 1024 * 1024;
            if(memory_size >= 16 * 1024 * 1024 && memory_size < 2048 * 1024 * 1024)
            {
                settings.memory_size = memory_size;
            }
            else
            {
                alert("Invalid memory size - ignored.");
                settings.memory_size = 32 * 1024 * 1024;
            }
        }

        if(!settings.vga_memory_size)
        {
            var video_memory_size = parseInt(_("video_memory_size").value, 10) * 1024 * 1024;
            if(video_memory_size > 64 * 1024 && video_memory_size < 2048 * 1024 * 1024)
            {
                settings.vga_memory_size = video_memory_size;
            }
            else
            {
                alert("Invalid video memory size - ignored.");
                settings.vga_memory_size = 8 * 1024 * 1024;
            }
        }

        init_ui(settings, cpu);
        cpu.init(settings);

        done(cpu);
    }

    function init_ui(settings, cpu)
    {
        _("boot_options").style.display = "none";
        //_("loading").style.display = "none";
        _("runtime_options").style.display = "block";
        document.getElementsByClassName("phone_keyboard")[0].style.display = "none";

        var running = true;

        _("run").onclick = function()
        {
            if(running)
            {
                running_time += Date.now() - last_tick;
                _("run").value = "Run";
                cpu.stop();
            }
            else
            {
                _("run").value = "Pause";
                cpu.run();
                last_tick = Date.now();
            }

            running = !running;
            _("run").blur();
        };

        _("exit").onclick = function()
        {
            location.href = location.pathname;
        };

        var time = _("running_time"),
            ips = _("speed"),
            avg_ips = _("avg_speed"),
            last_tick = Date.now(),
            running_time = 0,
            summed_ips = 0,
            last_instr_counter = 0;

        function update_info()
        {
            if(!running)
            {
                setTimeout(update_info, 1000);
                return;
            }

            var now = Date.now(),
                last_ips = (cpu.timestamp_counter - last_instr_counter) / 1000 | 0;

            summed_ips += last_ips
            running_time += now - last_tick;
            last_tick = now;

            ips.textContent = last_ips;
            avg_ips.textContent = summed_ips / running_time * 1000 | 0;
            time.textContent = time2str(running_time / 1000 | 0);

            last_instr_counter = cpu.timestamp_counter;

            setTimeout(update_info, 1000);
        }

        function update_other_info()
        {
            if(!running)
            {
                setTimeout(update_other_info, 1000);
                return;
            }

            var vga_stats = cpu.devices.vga.stats;

            if(vga_stats.is_graphical)
            {
                _("info_vga_mode").textContent = "Graphical";
                _("info_res").textContent = vga_stats.res_x + "x" + vga_stats.res_y;
            }
            else
            {
                _("info_vga_mode").textContent = "Terminal";
                _("info_res").textContent = "";
            }

            setTimeout(update_other_info, 1000);
        }

        setTimeout(update_info, 1000);
        setTimeout(update_other_info, 0);

        // writable image types
        var image_types = ["hda", "hdb", "fda", "fdb"];

        for(var i = 0; i < image_types.length; i++)
        {
            var elem = _("get_" + image_types[i] + "_image");
            var obj = settings[image_types[i]];

            if(obj && obj.byteLength < 16 * 1024 * 1024)
            {
                elem.onclick = (function(type)
                {
                    obj.get_buffer(function(b)
                    {
                        dump_file(b, type + ".img");
                    });

                    this.blur();

                }).bind(elem, image_types[i]);
            }
            else
            {
                elem.style.display = "none";
            }
        }

        _("ctrlaltdel").onclick = function()
        {
            var ps2 = cpu.devices.ps2;

            ps2.kbd_send_code(0x1D); // ctrl
            ps2.kbd_send_code(0x38); // alt
            ps2.kbd_send_code(0x53); // delete

            // break codes
            ps2.kbd_send_code(0x1D | 0x80); 
            ps2.kbd_send_code(0x38 | 0x80);
            ps2.kbd_send_code(0x53 | 0x80);

            _("ctrlaltdel").blur();
        };

        /*_("scale").onchange = function()
        {
            var n = parseFloat(this.value);

            if(n || n > 0)
            {
                settings.screen_adapter.set_scale(n, n);
            }
        };*/

        _("fullscreen").onclick = function()
        {
            var elem = document.getElementById("screen_container"),

                // bracket notation because otherwise they get renamed by closure compiler
                fn = elem["requestFullScreen"] || 
                    elem["webkitRequestFullscreen"] || 
                    elem["mozRequestFullScreen"] || 
                    elem["msRequestFullScreen"];

            if(fn)
            {
                fn.call(elem);

                // This is necessary, because otherwise chromium keyboard doesn't work anymore.
                // Might (but doesn't seem to) break something else
                document.getElementsByClassName("phone_keyboard")[0].focus();
            }

            lock_mouse(elem);
        };

        _("screen_container").onclick = function()
        {
            // allow text selection
            if(window.getSelection().isCollapsed)
            {
                document.getElementsByClassName("phone_keyboard")[0].focus();
            }
        };

        _("take_screenshot").onclick = function()
        {
            settings.screen_adapter.make_screenshot();

            _("take_screenshot").blur();
        };

        window.addEventListener("keydown", ctrl_w_rescue, false);
        window.addEventListener("keyup", ctrl_w_rescue, false);
        window.addEventListener("blur", ctrl_w_rescue, false);

        function ctrl_w_rescue(e)
        {
            if(e.ctrlKey)
            {
                window.onbeforeunload = function()
                {
                    window.onbeforeunload = null;
                    return "CTRL-W cannot be sent to the emulator.";
                }
            }
            else
            {
                window.onbeforeunload = null;
            }
        }
    }

    function debug_start(cpu)
    {
        // called as soon as soon as emulation is started, in debug mode
        var debug = cpu.debug;

        _("step").onclick = debug.step.bind(debug);
        _("run_until").onclick = debug.run_until.bind(debug);
        _("debugger").onclick = debug.debugger.bind(debug);
        _("dump_gdt").onclick = debug.dump_gdt_ldt.bind(debug);
        _("dump_idt").onclick = debug.dump_idt.bind(debug);
        _("dump_regs").onclick = debug.dump_regs.bind(debug);
        _("dump_pt").onclick = debug.dump_page_directory.bind(debug);
        _("dump_instructions").onclick = debug.dump_instructions.bind(debug);

        _("memory_dump").onclick = function()
        {
            dump_file(debug.get_memory_dump(), "v86-memory.bin");
            _("memory_dump").blur();
        };

        _("save_state").onclick = function()
        {
            dump_file(cpu.save_state(), "v86-state.bin");
            _("save_state").blur();
        };

        window.cpu = cpu;
    }

    function onpopstate(e)
    {
        location.reload();
    }
})();
