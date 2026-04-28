cmake_minimum_required(VERSION 3.16)

project(ruyi_cmake_hello_riscv C)

add_executable(hello-ruyi main.c)
target_compile_features(hello-ruyi PRIVATE c_std_11)

if(CMAKE_CROSSCOMPILING)
  message(STATUS "Cross compiling for ${CMAKE_SYSTEM_PROCESSOR}")
endif()
